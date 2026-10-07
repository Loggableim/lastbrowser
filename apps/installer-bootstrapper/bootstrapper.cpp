#include <windows.h>
#include <objidl.h>
#include <winhttp.h>
#include <wincrypt.h>
#include <wintrust.h>
#include <softpub.h>
#include <bcrypt.h>
#include <gdiplus.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <shellapi.h>
#include <winver.h>
#include <algorithm>
#include <array>
#include <cstdint>
#include <cmath>
#include <memory>
#include <string>
#include <vector>
#include "payload.h"
#include "resource.h"
#include "bootstrapper_core.h"

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "wintrust.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "version.lib")

namespace {
constexpr wchar_t kClassName[] = L"LastbrowserDownloadBootstrapper";
constexpr UINT kProgressMessage = WM_APP + 1;
constexpr UINT kWorkerMessage = WM_APP + 2;
constexpr int kButtonId = 1001;
constexpr int kProgressId = 1002;
constexpr int kStatusId = 1003;
constexpr int kChangeFolderId = 1004;

enum class Phase { AwaitingDownload, Downloading, Cancelling, Verifying, Installing, Ready, Failed };
enum class WorkerMessageKind { VerificationStarted, DownloadCancelled, DownloadFailed, DownloadVerified,
                               InstallationFailed, InstallationVerified };
struct Progress { DWORD attemptId{}; unsigned long long received{}; unsigned long long total{}; };
struct WorkerMessage {
    DWORD attemptId{};
    WorkerMessageKind kind{};
    std::wstring text;
    std::wstring path;
};
struct DownloadWorkerContext { HWND window{}; HANDLE cancelEvent{}; DWORD attemptId{}; };
struct AppState {
    HWND window{};
    HWND status{};
    HWND progress{};
    HWND button{};
    HWND path{};
    HWND changeFolder{};
    Phase phase{Phase::AwaitingDownload};
    HANDLE cancelEvent{};
    HANDLE workerFallbackEvent{};
    HANDLE downloadThread{};
    HANDLE installerThread{};
    DWORD downloadAttemptId{};
    std::wstring downloadedPath;
    std::wstring installDirectory;
    std::wstring installedExe;
    bool installerRunning{};
    bool retryAvailable{};
    bool attemptedDownload{};
    bool closeWhenDownloadStops{};
    bool reducedMotion{true};
    ULONG_PTR gdiplusToken{};
    Gdiplus::Image* logo{};
    IStream* logoStream{};
} g;
SRWLOCK gWorkerFallbackLock = SRWLOCK_INIT;
WorkerMessage* gWorkerFallbackMessage{};

void setStatus(const wchar_t* text) { if (g.status) SetWindowTextW(g.status, text); }
bool cancelled(HANDLE cancelEvent) { return cancelEvent && WaitForSingleObject(cancelEvent, 0) == WAIT_OBJECT_0; }

bool postWorkerMessageSink(void* rawMessage, void* rawWindow) {
    HWND window = reinterpret_cast<HWND>(rawWindow);
    return window && PostMessageW(window, kWorkerMessage, 0, reinterpret_cast<LPARAM>(rawMessage)) != FALSE;
}

bool queueWorkerFallbackSink(void* rawMessage, void*) {
    if (!rawMessage || !g.workerFallbackEvent) return false;
    AcquireSRWLockExclusive(&gWorkerFallbackLock);
    if (gWorkerFallbackMessage) {
        ReleaseSRWLockExclusive(&gWorkerFallbackLock);
        return false;
    }
    gWorkerFallbackMessage = static_cast<WorkerMessage*>(rawMessage);
    const bool signaled = SetEvent(g.workerFallbackEvent) != FALSE;
    if (!signaled) gWorkerFallbackMessage = nullptr;
    ReleaseSRWLockExclusive(&gWorkerFallbackLock);
    return signaled;
}

bool postWorkerMessage(HWND window, std::unique_ptr<WorkerMessage> message, bool terminal = true) {
    if (!window || !message) return false;
    WorkerMessage* raw = message.release();
    const auto delivery = bootstrapper_core::deliverWorkerMessage(raw, postWorkerMessageSink,
        terminal ? queueWorkerFallbackSink : nullptr, window);
    if (delivery == bootstrapper_core::WorkerDelivery::Failed) {
        message.reset(raw);
        return false;
    }
    return true;
}

bool postWorkerResult(HWND window, DWORD attemptId, WorkerMessageKind kind,
                      const wchar_t* text = L"", std::wstring path = {}, bool terminal = true) {
    auto message = std::make_unique<WorkerMessage>();
    message->attemptId = attemptId;
    message->kind = kind;
    message->text = text ? text : L"";
    message->path = std::move(path);
    return postWorkerMessage(window, std::move(message), terminal);
}

void joinAndClose(HANDLE& thread) {
    if (!thread) return;
    WaitForSingleObject(thread, INFINITE);
    CloseHandle(thread);
    thread = nullptr;
}

void joinDownloadWorker() { joinAndClose(g.downloadThread); }
void joinInstallerWorker() { joinAndClose(g.installerThread); }

std::wstring formatBytes(unsigned long long value) {
    wchar_t buffer[64]{};
    swprintf_s(buffer, L"%llu / %llu bytes", value, payload::kBytes);
    return buffer;
}

bool downloadPinnedPayload(const std::wstring& destination, HWND window, DWORD attemptId, HANDLE cancelEvent) {
    HINTERNET session = WinHttpOpen(L"LastbrowserBootstrapper/0.1.47",
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) return false;
    if (!bootstrapper_core::configureHttpSession(session, WinHttpSetOption, WinHttpSetTimeouts)) {
        WinHttpCloseHandle(session);
        return false;
    }

    std::wstring currentUrl = payload::kUrl;
    HINTERNET request = nullptr;
    HINTERNET connection = nullptr;
    HANDLE file = INVALID_HANDLE_VALUE;
    bool ok = false;
    unsigned redirectsFollowed = 0;
    constexpr unsigned maximumRedirects = 5;
    while (!cancelled(cancelEvent)) {
        bootstrapper_core::ParsedHttpsUrl parsed{};
        if (!bootstrapper_core::parseAllowedHttpsUrl(currentUrl, parsed)) break;
        connection = WinHttpConnect(session, parsed.host.c_str(), parsed.port, 0);
        if (!connection) break;
        const std::wstring requestPath = parsed.path + parsed.extraInfo;
        request = WinHttpOpenRequest(connection, L"GET", requestPath.c_str(), nullptr,
            WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE);
        if (!request || !WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
            WINHTTP_NO_REQUEST_DATA, 0, 0, 0) || !WinHttpReceiveResponse(request, nullptr)) break;

        DWORD status = 0, statusSize = sizeof(status);
        if (!WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize, WINHTTP_NO_HEADER_INDEX)) break;
        std::wstring location;
        if (status >= 300 && status < 400) {
            DWORD chars = 0;
            WinHttpQueryHeaders(request, WINHTTP_QUERY_LOCATION, WINHTTP_HEADER_NAME_BY_INDEX, nullptr, &chars, WINHTTP_NO_HEADER_INDEX);
            if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || chars == 0 || chars > 32768 * sizeof(wchar_t)) break;
            std::vector<wchar_t> locationBuffer(chars / sizeof(wchar_t) + 1);
            if (!WinHttpQueryHeaders(request, WINHTTP_QUERY_LOCATION, WINHTTP_HEADER_NAME_BY_INDEX,
                locationBuffer.data(), &chars, WINHTTP_NO_HEADER_INDEX)) break;
            location.assign(locationBuffer.data(), wcsnlen_s(locationBuffer.data(), locationBuffer.size()));
        }

        std::wstring nextUrl;
        const auto responseAction = bootstrapper_core::validateHttpResponse(
            status, currentUrl, location, redirectsFollowed, maximumRedirects, nextUrl);
        if (responseAction == bootstrapper_core::HttpResponseAction::FollowRedirect) {
            WinHttpCloseHandle(request); request = nullptr;
            WinHttpCloseHandle(connection); connection = nullptr;
            currentUrl = std::move(nextUrl);
            ++redirectsFollowed;
            continue;
        }
        if (responseAction != bootstrapper_core::HttpResponseAction::ReadBody) break;

        wchar_t contentLength[64]{};
        DWORD lengthChars = sizeof(contentLength);
        if (!WinHttpQueryHeaders(request, WINHTTP_QUERY_CONTENT_LENGTH, WINHTTP_HEADER_NAME_BY_INDEX,
            contentLength, &lengthChars, WINHTTP_NO_HEADER_INDEX)) break;
        wchar_t* end = nullptr;
        const unsigned long long total = _wcstoui64(contentLength, &end, 10);
        if (end == contentLength || *end != L'\0' || total != payload::kBytes) break;

        file = CreateFileW(destination.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
            FILE_ATTRIBUTE_TEMPORARY | FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
        if (file == INVALID_HANDLE_VALUE) break;
        unsigned long long received = 0;
        std::array<unsigned char, 128 * 1024> buffer{};
        while (!cancelled(cancelEvent)) {
            DWORD available = 0;
            if (!WinHttpQueryDataAvailable(request, &available)) break;
            if (!available) { ok = received == total; break; }
            const DWORD ask = static_cast<DWORD>(std::min<size_t>(buffer.size(), available));
            DWORD read = 0;
            if (!WinHttpReadData(request, buffer.data(), ask, &read) || read == 0) break;
            DWORD written = 0;
            if (!WriteFile(file, buffer.data(), read, &written, nullptr) || written != read) { ok = false; break; }
            received += read;
            if (received > total) { ok = false; break; }
            Progress* update = new Progress{attemptId, received, total};
            if (!PostMessageW(window, kProgressMessage, 0, reinterpret_cast<LPARAM>(update))) delete update;
        }
        break;
    }
    if (file != INVALID_HANDLE_VALUE) { if (!FlushFileBuffers(file)) ok = false; CloseHandle(file); }
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);
    if (!ok || cancelled(cancelEvent)) DeleteFileW(destination.c_str());
    return ok && !cancelled(cancelEvent);
}

bool readFileSize(const std::wstring& path, std::uint64_t& bytes, void*) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
        FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER size{};
    const bool ok = GetFileSizeEx(file, &size) != FALSE && size.QuadPart >= 0;
    CloseHandle(file);
    if (!ok) return false;
    bytes = static_cast<std::uint64_t>(size.QuadPart);
    return true;
}

bool readSha256(const std::wstring& path, std::string& digestText, void*) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
        FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    BCRYPT_ALG_HANDLE algorithm{};
    BCRYPT_HASH_HANDLE hash{};
    DWORD objectBytes = 0, resultBytes = 0;
    std::vector<UCHAR> object, digest(32);
    bool ok = BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) >= 0 &&
              BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&objectBytes), sizeof(objectBytes), &resultBytes, 0) >= 0;
    if (ok) { object.resize(objectBytes); ok = BCryptCreateHash(algorithm, &hash, object.data(), objectBytes, nullptr, 0, 0) >= 0; }
    std::array<UCHAR, 256 * 1024> buffer{};
    while (ok) {
        DWORD read = 0;
        if (!ReadFile(file, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr)) { ok = false; break; }
        if (!read) break;
        ok = BCryptHashData(hash, buffer.data(), read, 0) >= 0;
    }
    if (ok) ok = BCryptFinishHash(hash, digest.data(), static_cast<ULONG>(digest.size()), 0) >= 0;
    if (hash) BCryptDestroyHash(hash);
    if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
    CloseHandle(file);
    if (!ok) return false;
    static constexpr char hex[] = "0123456789abcdef";
    digestText.clear(); digestText.reserve(64);
    for (UCHAR b : digest) { digestText.push_back(hex[b >> 4]); digestText.push_back(hex[b & 15]); }
    return true;
}

bool readTrustedPublisherThumbprint(const std::wstring& path, std::wstring& thumbprint, void*) {
    WINTRUST_FILE_INFO fileInfo{}; fileInfo.cbStruct = sizeof(fileInfo); fileInfo.pcwszFilePath = path.c_str();
    WINTRUST_DATA trust{}; trust.cbStruct = sizeof(trust); trust.dwUIChoice = WTD_UI_NONE;
    trust.fdwRevocationChecks = WTD_REVOKE_NONE; trust.dwUnionChoice = WTD_CHOICE_FILE;
    trust.pFile = &fileInfo; trust.dwStateAction = WTD_STATEACTION_VERIFY;
    trust.dwProvFlags = WTD_CACHE_ONLY_URL_RETRIEVAL;
    GUID action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    LONG status = WinVerifyTrust(nullptr, &action, &trust);
    trust.dwStateAction = WTD_STATEACTION_CLOSE;
    WinVerifyTrust(nullptr, &action, &trust);
    if (status != ERROR_SUCCESS) return false;

    HCERTSTORE store{}; HCRYPTMSG message{}; DWORD encoding{}, content{}, format{};
    if (!CryptQueryObject(CERT_QUERY_OBJECT_FILE, path.c_str(), CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED_EMBED,
        CERT_QUERY_FORMAT_FLAG_BINARY, 0, &encoding, &content, &format, &store, &message, nullptr)) return false;
    DWORD signerBytes = 0;
    bool extracted = false;
    if (CryptMsgGetParam(message, CMSG_SIGNER_INFO_PARAM, 0, nullptr, &signerBytes) && signerBytes) {
        std::vector<BYTE> signerBuffer(signerBytes);
        auto* signer = reinterpret_cast<CMSG_SIGNER_INFO*>(signerBuffer.data());
        if (CryptMsgGetParam(message, CMSG_SIGNER_INFO_PARAM, 0, signer, &signerBytes)) {
            CERT_INFO find{}; find.Issuer = signer->Issuer; find.SerialNumber = signer->SerialNumber;
            PCCERT_CONTEXT cert = CertFindCertificateInStore(store, encoding, 0, CERT_FIND_SUBJECT_CERT, &find, nullptr);
            if (cert) {
                BYTE thumb[20]{}; DWORD thumbBytes = sizeof(thumb);
                if (CertGetCertificateContextProperty(cert, CERT_SHA1_HASH_PROP_ID, thumb, &thumbBytes) && thumbBytes == 20) {
                    static constexpr wchar_t hex[] = L"0123456789ABCDEF";
                    std::wstring actual; actual.reserve(40);
                    for (BYTE b : thumb) { actual.push_back(hex[b >> 4]); actual.push_back(hex[b & 15]); }
                    thumbprint = std::move(actual);
                    extracted = true;
                }
                CertFreeCertificateContext(cert);
            }
        }
    }
    if (message) CryptMsgClose(message);
    if (store) CertCloseStore(store, 0);
    return extracted;
}

bool publisherMatches(const std::wstring& path) {
    std::wstring actual;
    return readTrustedPublisherThumbprint(path, actual, nullptr) &&
           _wcsicmp(actual.c_str(), payload::kPublisherThumbprint) == 0;
}

bootstrapper_core::PinnedPayloadResult verifyDownloadedPayload(const std::wstring& path) {
    std::string expectedHash;
    expectedHash.reserve(64);
    for (wchar_t ch : payload::kSha256) expectedHash.push_back(static_cast<char>(ch));
    return bootstrapper_core::validatePinnedPayload(path, payload::kBytes, expectedHash,
        payload::kPublisherThumbprint, readFileSize, readSha256, readTrustedPublisherThumbprint, nullptr);
}

std::wstring getDownloadPath() {
    PWSTR local = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &local))) return {};
    std::wstring directory = local; CoTaskMemFree(local);
    directory += L"\\Lastbrowser\\Bootstrapper";
    const int createResult = SHCreateDirectoryExW(nullptr, directory.c_str(), nullptr);
    if (createResult != ERROR_SUCCESS && createResult != ERROR_ALREADY_EXISTS && createResult != ERROR_FILE_EXISTS) return {};
    GUID guid{}; if (FAILED(CoCreateGuid(&guid))) return {};
    wchar_t id[40]{}; StringFromGUID2(guid, id, 40);
    return directory + L"\\Lastbrowser-0.1.47-" + id + L".exe";
}

bool lookupCurrentUserInstallLocation(const wchar_t* key, const wchar_t* valueName,
                                      std::wstring& value, void*) {
    HKEY installKey{};
    if (RegOpenKeyExW(HKEY_CURRENT_USER, key, 0, KEY_READ, &installKey) != ERROR_SUCCESS) return false;
    std::array<wchar_t, MAX_PATH> buffer{};
    DWORD bytes = static_cast<DWORD>(buffer.size() * sizeof(wchar_t));
    DWORD type = 0;
    const LONG result = RegQueryValueExW(installKey, valueName, nullptr, &type,
        reinterpret_cast<BYTE*>(buffer.data()), &bytes);
    RegCloseKey(installKey);
    if (result != ERROR_SUCCESS || type != REG_SZ || bytes < sizeof(wchar_t) || bytes > sizeof(buffer)) return false;
    value.assign(buffer.data());
    return true;
}

std::wstring perUserDefaultInstallDirectory() {
    std::wstring existing;
    if (bootstrapper_core::readPerUserInstallLocation(lookupCurrentUserInstallLocation, nullptr, existing)) return existing;
    static const GUID userProgramFiles = {0x5CD7AEE2, 0x2219, 0x4A67, {0xB8, 0x5D, 0x6C, 0x9C, 0xE1, 0x56, 0x60, 0xCB}};
    PWSTR base = nullptr;
    if (FAILED(SHGetKnownFolderPath(userProgramFiles, KF_FLAG_CREATE, nullptr, &base)) &&
        FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &base))) return {};
    std::wstring candidate = std::wstring(base) + L"\\Lastbrowser";
    CoTaskMemFree(base);
    std::wstring normalized;
    return bootstrapper_core::normalizeInstallDirectory(candidate, normalized) ? normalized : std::wstring();
}

bool installedExeValid(const std::wstring& path) {
    DWORD attrs = GetFileAttributesW(path.c_str());
    if (attrs == INVALID_FILE_ATTRIBUTES || (attrs & FILE_ATTRIBUTE_DIRECTORY) || !publisherMatches(path)) return false;
    DWORD ignored = 0;
    DWORD size = GetFileVersionInfoSizeW(path.c_str(), &ignored);
    if (!size) return false;
    std::vector<BYTE> version(size);
    VS_FIXEDFILEINFO* info = nullptr; UINT infoSize = 0;
    if (!GetFileVersionInfoW(path.c_str(), 0, size, version.data()) ||
        !VerQueryValueW(version.data(), L"\\", reinterpret_cast<void**>(&info), &infoSize) ||
        !info || infoSize < sizeof(VS_FIXEDFILEINFO) || info->dwSignature != 0xFEEF04BD) return false;
    return HIWORD(info->dwFileVersionMS) == 0 && LOWORD(info->dwFileVersionMS) == 1 &&
           HIWORD(info->dwFileVersionLS) == 47 && LOWORD(info->dwFileVersionLS) == 0;
}

DWORD WINAPI downloadWorker(LPVOID rawContext) {
    std::unique_ptr<DownloadWorkerContext> context(static_cast<DownloadWorkerContext*>(rawContext));
    if (!context) return 1;
    const std::wstring path = getDownloadPath();
    if (path.empty() || !downloadPinnedPayload(path, context->window, context->attemptId, context->cancelEvent)) {
        const bool wasCancelled = cancelled(context->cancelEvent);
        postWorkerResult(context->window, context->attemptId,
            wasCancelled ? WorkerMessageKind::DownloadCancelled : WorkerMessageKind::DownloadFailed,
            wasCancelled ? L"Download abgebrochen" : L"Download fehlgeschlagen");
        return 0;
    }

    if (cancelled(context->cancelEvent)) {
        DeleteFileW(path.c_str());
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::DownloadCancelled, L"Download abgebrochen");
        return 0;
    }
    postWorkerResult(context->window, context->attemptId,
        WorkerMessageKind::VerificationStarted, L"Prüfen", {}, false);

    const auto verification = verifyDownloadedPayload(path);
    if (cancelled(context->cancelEvent)) {
        DeleteFileW(path.c_str());
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::DownloadCancelled, L"Download abgebrochen");
        return 0;
    }
    if (verification != bootstrapper_core::PinnedPayloadResult::Accepted) {
        DeleteFileW(path.c_str());
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::DownloadFailed, L"Prüfung fehlgeschlagen");
        return 0;
    }
    if (!postWorkerResult(context->window, context->attemptId, WorkerMessageKind::DownloadVerified, L"", path)) {
        DeleteFileW(path.c_str());
    }
    return 0;
}

struct InstallerWorkerContext {
    HWND window{};
    DWORD attemptId{};
    std::wstring setupPath;
    std::wstring installDirectory;
};

DWORD WINAPI installerWorker(LPVOID rawContext) {
    std::unique_ptr<InstallerWorkerContext> context(static_cast<InstallerWorkerContext*>(rawContext));
    if (!context) return 1;
    STARTUPINFOW si{}; si.cb = sizeof(si); PROCESS_INFORMATION pi{};
    std::wstring command;
    if (!bootstrapper_core::buildNsisCommandLine(context->setupPath, context->installDirectory, command)) {
        DeleteFileW(context->setupPath.c_str());
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::InstallationFailed, L"Installationsort ungültig");
        return 0;
    }
    if (!CreateProcessW(context->setupPath.c_str(), command.data(), nullptr, nullptr, FALSE, 0, nullptr,
        nullptr, &si, &pi)) {
        DeleteFileW(context->setupPath.c_str());
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::InstallationFailed, L"Installation fehlgeschlagen");
        return 0;
    }
    CloseHandle(pi.hThread);
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD exitCode = 1; GetExitCodeProcess(pi.hProcess, &exitCode); CloseHandle(pi.hProcess);
    DeleteFileW(context->setupPath.c_str());
    if (exitCode != 0) {
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::InstallationFailed, L"Installation fehlgeschlagen");
        return 0;
    }
    std::wstring registeredPath;
    if (!bootstrapper_core::readPerUserInstallLocation(lookupCurrentUserInstallLocation, nullptr, registeredPath) ||
        _wcsicmp(registeredPath.c_str(), context->installDirectory.c_str()) != 0) {
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::InstallationFailed, L"Installation nicht bestätigt");
        return 0;
    }
    std::wstring exe = registeredPath + L"\\Lastbrowser.exe";
    if (!installedExeValid(exe)) {
        postWorkerResult(context->window, context->attemptId, WorkerMessageKind::InstallationFailed, L"Start nicht verfügbar");
        return 0;
    }
    postWorkerResult(context->window, context->attemptId, WorkerMessageKind::InstallationVerified, L"", exe);
    return 0;
}

void chooseInstallDirectory() {
    IFileDialog* dialog = nullptr;
    if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
        IID_PPV_ARGS(&dialog)))) { setStatus(L"Ordnerauswahl nicht verfügbar"); return; }
    DWORD options = 0;
    if (SUCCEEDED(dialog->GetOptions(&options)))
        dialog->SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
    dialog->SetTitle(L"LastBrowser-Installationsordner auswählen");
    IShellItem* initialFolder = nullptr;
    if (SUCCEEDED(SHCreateItemFromParsingName(g.installDirectory.c_str(), nullptr, IID_PPV_ARGS(&initialFolder)))) {
        dialog->SetFolder(initialFolder); initialFolder->Release();
    }
    if (dialog->Show(g.window) == S_OK) {
        IShellItem* result = nullptr;
        if (SUCCEEDED(dialog->GetResult(&result))) {
            PWSTR selected = nullptr;
            if (SUCCEEDED(result->GetDisplayName(SIGDN_FILESYSPATH, &selected))) {
                std::wstring normalized;
                if (bootstrapper_core::normalizeInstallDirectory(selected, normalized)) {
                    g.installDirectory = std::move(normalized);
                    std::wstring label = L"Installationsort: " + g.installDirectory;
                    SetWindowTextW(g.path, label.c_str());
                    setStatus(g.phase == Phase::Failed ? L"Für einen neuen Versuch bereit" : L"Bereit zum Download");
                } else setStatus(L"Ordner ungültig");
                CoTaskMemFree(selected);
            }
            result->Release();
        }
    }
    dialog->Release();
}

void updatePhaseControls();

void startButtonAction() {
    if (g.phase == Phase::Ready && !g.installedExe.empty()) {
        if (!installedExeValid(g.installedExe)) {
            g.installedExe.clear(); g.retryAvailable = false; g.phase = Phase::Failed;
            setStatus(L"Start nicht möglich"); updatePhaseControls(); return;
        }
        STARTUPINFOW si{}; si.cb = sizeof(si); PROCESS_INFORMATION pi{};
        std::wstring command = L"\"" + g.installedExe + L"\"";
        const size_t separator = g.installedExe.find_last_of(L"\\/");
        const std::wstring workingDirectory = separator == std::wstring::npos ? std::wstring() : g.installedExe.substr(0, separator);
        if (!CreateProcessW(g.installedExe.c_str(), command.data(), nullptr, nullptr, FALSE, 0, nullptr,
            workingDirectory.empty() ? nullptr : workingDirectory.c_str(), &si, &pi)) {
            g.phase = Phase::Failed; g.retryAvailable = false; setStatus(L"Start nicht möglich"); updatePhaseControls();
        }
        else { CloseHandle(pi.hThread); CloseHandle(pi.hProcess); PostQuitMessage(0); }
    } else if (g.phase == Phase::Failed) {
        PostQuitMessage(0);
    }
}

void updatePhaseControls() {
    const bool firstAttempt = !g.attemptedDownload;
    const bool canStartDownload = bootstrapper_core::canStartDownloadAttempt(
        firstAttempt, g.retryAvailable, g.downloadThread == nullptr, g.installerRunning);
    if (g.phase == Phase::AwaitingDownload) {
        SetWindowTextW(g.button, L"Download starten"); EnableWindow(g.button, canStartDownload);
    } else if (g.phase == Phase::Downloading) {
        SetWindowTextW(g.button, L"Abbrechen"); EnableWindow(g.button, TRUE);
    } else if (g.phase == Phase::Cancelling) {
        SetWindowTextW(g.button, L"Abbruch läuft …"); EnableWindow(g.button, FALSE);
    } else if (g.phase == Phase::Verifying) {
        SetWindowTextW(g.button, L"Prüfen"); EnableWindow(g.button, FALSE);
    } else if (g.phase == Phase::Installing) {
        SetWindowTextW(g.button, L"Installieren"); EnableWindow(g.button, FALSE);
    } else if (g.phase == Phase::Ready) {
        SetWindowTextW(g.button, L"LastBrowser starten"); EnableWindow(g.button, !g.installedExe.empty());
    } else {
        SetWindowTextW(g.button, canStartDownload ? L"Erneut versuchen" : L"Schließen"); EnableWindow(g.button, TRUE);
    }
    const bool canChooseFolder = g.phase == Phase::AwaitingDownload ||
        (g.phase == Phase::Failed && canStartDownload);
    if (g.changeFolder) {
        ShowWindow(g.changeFolder, canChooseFolder ? SW_SHOW : SW_HIDE);
        EnableWindow(g.changeFolder, canChooseFolder);
    }
    InvalidateRect(g.window, nullptr, TRUE);
}

void startDownloadAttempt() {
    const bool firstAttempt = !g.attemptedDownload;
    if (!bootstrapper_core::canStartDownloadAttempt(firstAttempt, g.retryAvailable,
            g.downloadThread == nullptr, g.installerRunning)) return;
    joinDownloadWorker();
    if (!g.cancelEvent || !ResetEvent(g.cancelEvent)) {
        g.phase = Phase::Failed; g.retryAvailable = true;
        setStatus(L"Download fehlgeschlagen — bitte erneut versuchen"); updatePhaseControls(); return;
    }
    ++g.downloadAttemptId;
    if (g.downloadAttemptId == 0) ++g.downloadAttemptId;
    g.downloadedPath.clear();
    g.attemptedDownload = true;
    g.retryAvailable = false;
    g.phase = Phase::Downloading;
    SendMessageW(g.progress, PBM_SETPOS, 0, 0);
    setStatus(L"Download 0 / 174778024 bytes");
    updatePhaseControls();

    auto context = std::make_unique<DownloadWorkerContext>();
    context->window = g.window;
    context->cancelEvent = g.cancelEvent;
    context->attemptId = g.downloadAttemptId;
    g.downloadThread = CreateThread(nullptr, 0, downloadWorker, context.get(), 0, nullptr);
    if (g.downloadThread) {
        context.release();
        return;
    }
    g.phase = Phase::Failed; g.retryAvailable = true;
    setStatus(L"Download konnte nicht gestartet werden"); updatePhaseControls();
}

void startInstallerAttempt(DWORD attemptId) {
    const bool verifiedDownload = g.phase == Phase::Verifying && !g.downloadedPath.empty();
    if (!bootstrapper_core::canStartInstallerAttempt(verifiedDownload,
            g.downloadThread == nullptr, g.installerRunning)) return;
    auto context = std::make_unique<InstallerWorkerContext>();
    context->window = g.window;
    context->attemptId = attemptId;
    context->setupPath = g.downloadedPath;
    context->installDirectory = g.installDirectory;
    g.phase = Phase::Installing; g.retryAvailable = false; g.installerRunning = true;
    setStatus(L"Installieren"); updatePhaseControls();
    g.installerThread = CreateThread(nullptr, 0, installerWorker, context.get(), 0, nullptr);
    if (g.installerThread) {
        context.release();
        return;
    }
    g.installerRunning = false;
    DeleteFileW(g.downloadedPath.c_str());
    g.downloadedPath.clear();
    g.phase = Phase::Failed;
    setStatus(L"Installation konnte nicht gestartet werden"); updatePhaseControls();
}

void discardQueuedWorkerMessages(HWND window) {
    MSG queued{};
    while (PeekMessageW(&queued, window, kProgressMessage, kWorkerMessage, PM_REMOVE)) {
        if (queued.message == kProgressMessage) delete reinterpret_cast<Progress*>(queued.lParam);
        else if (queued.message == kWorkerMessage) delete reinterpret_cast<WorkerMessage*>(queued.lParam);
    }
    AcquireSRWLockExclusive(&gWorkerFallbackLock);
    WorkerMessage* fallback = gWorkerFallbackMessage;
    gWorkerFallbackMessage = nullptr;
    if (g.workerFallbackEvent) ResetEvent(g.workerFallbackEvent);
    ReleaseSRWLockExclusive(&gWorkerFallbackLock);
    delete fallback;
}

WorkerMessage* takeFallbackWorkerMessage() {
    AcquireSRWLockExclusive(&gWorkerFallbackLock);
    WorkerMessage* message = gWorkerFallbackMessage;
    gWorkerFallbackMessage = nullptr;
    if (g.workerFallbackEvent) ResetEvent(g.workerFallbackEvent);
    ReleaseSRWLockExclusive(&gWorkerFallbackLock);
    return message;
}

void drawLogo(HDC dc) {
    if (!g.logo) return;
    Gdiplus::Graphics graphics(dc);
    graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    const int width = 340, height = 88;
    const int left = (380 - width) / 2, top = 20;
    if (!g.reducedMotion) {
        const double cycle = fmod(static_cast<double>(GetTickCount64()), 3200.0) / 3200.0;
        const float alpha = static_cast<float>(0.10 + 0.08 * (0.5 - 0.5 * cos(cycle * 6.28318530718)));
        Gdiplus::ColorMatrix matrix{};
        matrix.m[0][0] = matrix.m[1][1] = matrix.m[2][2] = matrix.m[3][3] = matrix.m[4][4] = 1.0f;
        matrix.m[4][0] = 0.0f; matrix.m[4][1] = 0.56f; matrix.m[4][2] = 1.0f; matrix.m[4][3] = alpha;
        Gdiplus::ImageAttributes attributes; attributes.SetColorMatrix(&matrix);
        for (int pad : {18, 10, 4}) {
            Gdiplus::Rect glow(left - pad, top - pad / 2, width + pad * 2, height + pad);
            graphics.DrawImage(g.logo, glow, 0, 0, g.logo->GetWidth(), g.logo->GetHeight(), Gdiplus::UnitPixel, &attributes);
        }
    }
    graphics.DrawImage(g.logo, Gdiplus::Rect(left, top, width, height));
}

LRESULT CALLBACK windowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_CREATE: {
        g.window = hwnd;
        std::wstring pathText = L"Installationsort: " + g.installDirectory;
        g.path = CreateWindowExW(0, L"STATIC", pathText.c_str(), WS_CHILD | WS_VISIBLE | SS_PATHELLIPSIS,
            20, 123, 340, 36, hwnd, reinterpret_cast<HMENU>(static_cast<INT_PTR>(kStatusId)), nullptr, nullptr);
        g.changeFolder = CreateWindowExW(0, L"BUTTON", L"Installationsort ändern…", WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
            112, 163, 156, 30, hwnd, reinterpret_cast<HMENU>(static_cast<INT_PTR>(kChangeFolderId)), nullptr, nullptr);
        g.status = CreateWindowExW(0, L"STATIC", L"Bereit zum Download", WS_CHILD | WS_VISIBLE | SS_CENTER,
            20, 199, 340, 24, hwnd, reinterpret_cast<HMENU>(static_cast<INT_PTR>(kStatusId + 10)), nullptr, nullptr);
        g.progress = CreateWindowExW(0, PROGRESS_CLASSW, nullptr, WS_CHILD | WS_VISIBLE | PBS_SMOOTH,
            36, 229, 308, 12, hwnd, reinterpret_cast<HMENU>(static_cast<INT_PTR>(kProgressId)), nullptr, nullptr);
        SendMessageW(g.progress, PBM_SETRANGE32, 0, 1000);
        g.button = CreateWindowExW(0, L"BUTTON", L"Download starten", WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
            112, 258, 156, 34, hwnd, reinterpret_cast<HMENU>(static_cast<INT_PTR>(kButtonId)), nullptr, nullptr);
        return 0;
    }
    case WM_PAINT: {
        PAINTSTRUCT ps{}; HDC dc = BeginPaint(hwnd, &ps);
        RECT rect{}; GetClientRect(hwnd, &rect);
        HBRUSH brush = CreateSolidBrush(RGB(14, 18, 31)); FillRect(dc, &rect, brush); DeleteObject(brush);
        drawLogo(dc); EndPaint(hwnd, &ps); return 0;
    }
    case WM_TIMER:
        if (!g.reducedMotion) InvalidateRect(hwnd, nullptr, FALSE);
        return 0;
    case WM_CTLCOLORSTATIC:
        SetTextColor(reinterpret_cast<HDC>(wParam), RGB(238, 242, 255));
        SetBkColor(reinterpret_cast<HDC>(wParam), RGB(14, 18, 31));
        SetDCBrushColor(reinterpret_cast<HDC>(wParam), RGB(14, 18, 31));
        return reinterpret_cast<LRESULT>(GetStockObject(DC_BRUSH));
    case WM_COMMAND:
        if (LOWORD(wParam) == kChangeFolderId &&
            (g.phase == Phase::AwaitingDownload || (g.phase == Phase::Failed && g.retryAvailable))) {
            chooseInstallDirectory();
        } else if (LOWORD(wParam) == kButtonId) {
            const bool canStartDownload = bootstrapper_core::canStartDownloadAttempt(
                !g.attemptedDownload, g.retryAvailable, g.downloadThread == nullptr, g.installerRunning);
            if ((g.phase == Phase::AwaitingDownload || g.phase == Phase::Failed) && canStartDownload) {
                startDownloadAttempt();
            } else if (g.phase == Phase::Downloading) {
                SetEvent(g.cancelEvent);
                g.phase = Phase::Cancelling;
                setStatus(L"Download wird abgebrochen …");
                updatePhaseControls();
            } else startButtonAction();
        }
        return 0;
    case kProgressMessage: {
        auto* p = reinterpret_cast<Progress*>(lParam);
        if (p) {
            if (bootstrapper_core::isCurrentAttempt(p->attemptId, g.downloadAttemptId) &&
                g.phase == Phase::Downloading && p->total != 0) {
                const int percentage = static_cast<int>((p->received * 1000ULL) / p->total);
                SendMessageW(g.progress, PBM_SETPOS, percentage, 0);
                std::wstring text = L"Download " + formatBytes(p->received);
                setStatus(text.c_str());
            }
            delete p;
        }
        return 0;
    }
    case kWorkerMessage: {
        std::unique_ptr<WorkerMessage> worker(reinterpret_cast<WorkerMessage*>(lParam));
        if (!worker || !bootstrapper_core::isCurrentAttempt(worker->attemptId, g.downloadAttemptId)) return 0;
        switch (worker->kind) {
        case WorkerMessageKind::VerificationStarted:
            if (!g.closeWhenDownloadStops) {
                g.phase = Phase::Verifying;
                setStatus(worker->text.c_str());
                updatePhaseControls();
            }
            break;
        case WorkerMessageKind::DownloadCancelled:
        case WorkerMessageKind::DownloadFailed:
            joinDownloadWorker();
            g.downloadedPath.clear();
            if (g.closeWhenDownloadStops) {
                g.closeWhenDownloadStops = false;
                DestroyWindow(hwnd);
            } else {
                g.phase = Phase::Failed;
                g.retryAvailable = true;
                setStatus(worker->text.c_str());
                updatePhaseControls();
            }
            break;
        case WorkerMessageKind::DownloadVerified:
            joinDownloadWorker();
            if (g.closeWhenDownloadStops) {
                DeleteFileW(worker->path.c_str());
                g.closeWhenDownloadStops = false;
                DestroyWindow(hwnd);
            } else {
                g.downloadedPath = worker->path;
                g.phase = Phase::Verifying;
                startInstallerAttempt(worker->attemptId);
            }
            break;
        case WorkerMessageKind::InstallationFailed:
            joinInstallerWorker();
            g.installerRunning = false;
            if (!g.downloadedPath.empty()) DeleteFileW(g.downloadedPath.c_str());
            g.downloadedPath.clear();
            g.phase = Phase::Failed;
            g.retryAvailable = false;
            setStatus(worker->text.c_str());
            updatePhaseControls();
            break;
        case WorkerMessageKind::InstallationVerified:
            joinInstallerWorker();
            g.installerRunning = false;
            g.downloadedPath.clear();
            g.installedExe = worker->path;
            g.retryAvailable = false;
            g.phase = Phase::Ready;
            setStatus(L"Startklar");
            updatePhaseControls();
            break;
        }
        return 0;
    }
    case WM_CLOSE:
        if (g.installerRunning) return 0;
        if (g.downloadThread && (g.phase == Phase::Downloading || g.phase == Phase::Cancelling || g.phase == Phase::Verifying)) {
            g.closeWhenDownloadStops = true;
            SetEvent(g.cancelEvent);
            g.phase = Phase::Cancelling;
            setStatus(L"Download wird abgebrochen …");
            updatePhaseControls();
            return 0;
        }
        DestroyWindow(hwnd);
        return 0;
    case WM_DESTROY:
        if (g.cancelEvent) SetEvent(g.cancelEvent);
        joinDownloadWorker();
        joinInstallerWorker();
        discardQueuedWorkerMessages(hwnd);
        g.window = nullptr;
        KillTimer(hwnd, 1); PostQuitMessage(0); return 0;
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int show) {
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    BOOL animations = FALSE;
    g.reducedMotion = !SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0) || !animations;
    Gdiplus::GdiplusStartupInput gdip{};
    if (Gdiplus::GdiplusStartup(&g.gdiplusToken, &gdip, nullptr) != Gdiplus::Ok) return 2;
    HRSRC resource = FindResourceW(instance, MAKEINTRESOURCEW(IDR_LOGO), RT_RCDATA);
    HGLOBAL loaded = resource ? LoadResource(instance, resource) : nullptr;
    const DWORD logoSize = resource ? SizeofResource(instance, resource) : 0;
    const void* logoBytes = loaded ? LockResource(loaded) : nullptr;
    HGLOBAL streamMemory = logoSize ? GlobalAlloc(GMEM_MOVEABLE, logoSize) : nullptr;
    if (streamMemory) {
        void* dst = GlobalLock(streamMemory); if (dst) { CopyMemory(dst, logoBytes, logoSize); GlobalUnlock(streamMemory); }
        IStream* stream = nullptr;
        if (CreateStreamOnHGlobal(streamMemory, TRUE, &stream) == S_OK) { g.logoStream = stream; g.logo = Gdiplus::Image::FromStream(stream); }
        else GlobalFree(streamMemory);
    }
    g.cancelEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    g.workerFallbackEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!g.cancelEvent || !g.workerFallbackEvent || !g.logo || g.logo->GetLastStatus() != Gdiplus::Ok) return 4;
    g.installDirectory = perUserDefaultInstallDirectory();
    if (g.installDirectory.empty()) return 5;
    INITCOMMONCONTROLSEX controls{sizeof(controls), ICC_PROGRESS_CLASS}; InitCommonControlsEx(&controls);
    WNDCLASSW wc{}; wc.lpfnWndProc = windowProc; wc.hInstance = instance; wc.lpszClassName = kClassName;
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW); wc.hbrBackground = CreateSolidBrush(RGB(14, 18, 31));
    RegisterClassW(&wc);
    HWND window = CreateWindowExW(WS_EX_APPWINDOW, kClassName, L"LastBrowser", WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
        CW_USEDEFAULT, CW_USEDEFAULT, 380, 340, nullptr, nullptr, instance, nullptr);
    if (!window) return 3;
    RECT rect{}; GetWindowRect(window, &rect); const int x = (GetSystemMetrics(SM_CXSCREEN) - (rect.right - rect.left)) / 2;
    const int y = (GetSystemMetrics(SM_CYSCREEN) - (rect.bottom - rect.top)) / 2;
    SetWindowPos(window, nullptr, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
    ShowWindow(window, show); UpdateWindow(window);
    if (!g.reducedMotion) SetTimer(window, 1, 80, nullptr);
    MSG message{};
    int exitCode = 0;
    bool quit = false;
    HANDLE waitHandles[] = {g.workerFallbackEvent};
    while (!quit) {
        const DWORD wait = MsgWaitForMultipleObjects(1, waitHandles, FALSE, INFINITE, QS_ALLINPUT);
        if (wait == WAIT_OBJECT_0) {
            WorkerMessage* fallback = takeFallbackWorkerMessage();
            if (fallback) {
                if (g.window && IsWindow(g.window))
                    SendMessageW(g.window, kWorkerMessage, 0, reinterpret_cast<LPARAM>(fallback));
                else delete fallback;
            }
        } else if (wait == WAIT_OBJECT_0 + 1) {
            while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
                if (message.message == WM_QUIT) {
                    exitCode = static_cast<int>(message.wParam);
                    quit = true;
                    break;
                }
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        } else {
            quit = true;
        }
    }
    joinDownloadWorker();
    joinInstallerWorker();
    if (g.cancelEvent) CloseHandle(g.cancelEvent);
    if (g.workerFallbackEvent) CloseHandle(g.workerFallbackEvent);
    delete g.logo;
    if (g.logoStream) g.logoStream->Release();
    if (g.gdiplusToken) Gdiplus::GdiplusShutdown(g.gdiplusToken);
    CoUninitialize();
    return exitCode;
}
