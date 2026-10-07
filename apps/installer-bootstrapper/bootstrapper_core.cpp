#include "bootstrapper_core.h"
#include <array>
#include <cctype>
#include <cwchar>
#include <cwctype>

namespace bootstrapper_core {
namespace {
bool hasOnlyHex(const std::string& value, size_t expectedLength) {
    if (value.size() != expectedLength) return false;
    for (unsigned char ch : value) {
        if (!std::isxdigit(ch)) return false;
    }
    return true;
}

bool hasOnlyHex(const std::wstring& value, size_t expectedLength) {
    if (value.size() != expectedLength) return false;
    for (wchar_t ch : value) {
        if (!iswxdigit(ch)) return false;
    }
    return true;
}

bool equalsAsciiInsensitive(const std::string& left, const std::string& right) {
    if (left.size() != right.size()) return false;
    for (size_t i = 0; i < left.size(); ++i) {
        if (std::tolower(static_cast<unsigned char>(left[i])) !=
            std::tolower(static_cast<unsigned char>(right[i]))) return false;
    }
    return true;
}

bool equalsWideInsensitive(const std::wstring& left, const std::wstring& right) {
    return _wcsicmp(left.c_str(), right.c_str()) == 0;
}

bool hasUnsafeUrlCharacter(const std::wstring& value) {
    for (wchar_t ch : value) {
        if (ch <= 0x20 || ch == 0x7f || ch == L'\\') return true;
    }
    return false;
}

bool startsWithInsensitive(const std::wstring& value, const wchar_t* prefix) {
    const size_t prefixLength = wcslen(prefix);
    return value.size() >= prefixLength && _wcsnicmp(value.c_str(), prefix, prefixLength) == 0;
}
}

bool configureHttpSession(HINTERNET session, SetOptionFn setOption, SetTimeoutsFn setTimeouts) {
    if (!session || !setOption || !setTimeouts) return false;
    DWORD redirectPolicy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    if (!setOption(session, WINHTTP_OPTION_REDIRECT_POLICY, &redirectPolicy, sizeof(redirectPolicy))) return false;
    return setTimeouts(session, 15000, 15000, 30000, 2000) != FALSE;
}

bool isAllowedRedirectHost(const std::wstring& host) {
    return _wcsicmp(host.c_str(), L"github.com") == 0 ||
           _wcsicmp(host.c_str(), L"release-assets.githubusercontent.com") == 0 ||
           _wcsicmp(host.c_str(), L"objects.githubusercontent.com") == 0;
}

bool parseAllowedHttpsUrl(const std::wstring& url, ParsedHttpsUrl& parsed) {
    parsed = {};
    if (url.empty() || url.size() > 32768 || hasUnsafeUrlCharacter(url)) return false;

    const size_t schemeSeparator = url.find(L"://");
    if (schemeSeparator == std::wstring::npos) return false;
    const size_t authorityStart = schemeSeparator + 3;
    const size_t authorityEnd = url.find_first_of(L"/?#", authorityStart);
    const size_t authorityLength = (authorityEnd == std::wstring::npos ? url.size() : authorityEnd) - authorityStart;
    if (authorityLength == 0 || url.substr(authorityStart, authorityLength).find(L'@') != std::wstring::npos) return false;

    std::array<wchar_t, 16> scheme{};
    std::array<wchar_t, 512> host{};
    std::array<wchar_t, 32768> path{};
    std::array<wchar_t, 32768> extra{};
    URL_COMPONENTS parts{};
    parts.dwStructSize = sizeof(parts);
    parts.lpszScheme = scheme.data();
    parts.dwSchemeLength = static_cast<DWORD>(scheme.size());
    parts.lpszHostName = host.data();
    parts.dwHostNameLength = static_cast<DWORD>(host.size());
    parts.lpszUrlPath = path.data();
    parts.dwUrlPathLength = static_cast<DWORD>(path.size());
    parts.lpszExtraInfo = extra.data();
    parts.dwExtraInfoLength = static_cast<DWORD>(extra.size());
    if (!WinHttpCrackUrl(url.c_str(), static_cast<DWORD>(url.size()), 0, &parts) ||
        parts.nScheme != INTERNET_SCHEME_HTTPS || parts.nPort != INTERNET_DEFAULT_HTTPS_PORT ||
        parts.dwHostNameLength == 0 || parts.dwHostNameLength >= host.size() ||
        parts.dwUrlPathLength >= path.size() || parts.dwExtraInfoLength >= extra.size()) return false;

    parsed.host.assign(parts.lpszHostName, parts.dwHostNameLength);
    if (!isAllowedRedirectHost(parsed.host)) {
        parsed = {};
        return false;
    }
    if (parts.dwUrlPathLength) parsed.path.assign(parts.lpszUrlPath, parts.dwUrlPathLength);
    if (parts.dwExtraInfoLength) parsed.extraInfo.assign(parts.lpszExtraInfo, parts.dwExtraInfoLength);
    if (parsed.path.empty()) parsed.path = L"/";
    parsed.port = parts.nPort;
    return true;
}

bool resolveAllowedHttpsRedirect(const std::wstring& baseUrl, const std::wstring& location,
                                 std::wstring& resolvedUrl) {
    resolvedUrl.clear();
    if (location.empty() || location.size() > 32768 || hasUnsafeUrlCharacter(location)) return false;

    ParsedHttpsUrl base{};
    if (!parseAllowedHttpsUrl(baseUrl, base)) return false;
    const std::wstring origin = L"https://" + base.host;
    std::wstring candidate;
    if (location.find(L"://") != std::wstring::npos) {
        candidate = location;
    } else if (location.rfind(L"//", 0) == 0) {
        candidate = L"https:" + location;
    } else if (location.rfind(L"/", 0) == 0) {
        candidate = origin + location;
    } else if (location.rfind(L"?", 0) == 0 || location.rfind(L"#", 0) == 0) {
        candidate = origin + base.path + location;
    } else {
        const size_t slash = base.path.find_last_of(L'/');
        const std::wstring directory = slash == std::wstring::npos ? L"/" : base.path.substr(0, slash + 1);
        candidate = origin + directory + location;
    }

    ParsedHttpsUrl target{};
    if (!parseAllowedHttpsUrl(candidate, target)) return false;
    resolvedUrl = std::move(candidate);
    return true;
}

HttpResponseAction validateHttpResponse(DWORD status, const std::wstring& baseUrl,
                                        const std::wstring& location,
                                        unsigned redirectsFollowed, unsigned maximumRedirects,
                                        std::wstring& redirectTarget) {
    redirectTarget.clear();
    if (status == 200) return HttpResponseAction::ReadBody;
    const bool isRedirect = status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    if (!isRedirect || redirectsFollowed >= maximumRedirects ||
        !resolveAllowedHttpsRedirect(baseUrl, location, redirectTarget)) {
        redirectTarget.clear();
        return HttpResponseAction::Reject;
    }
    return HttpResponseAction::FollowRedirect;
}

bool isCurrentAttempt(DWORD messageAttemptId, DWORD currentAttemptId) {
    return currentAttemptId != 0 && messageAttemptId == currentAttemptId;
}

bool canStartDownloadAttempt(bool firstAttempt, bool retryAvailable,
                             bool previousDownloadJoined, bool installerRunning) {
    return previousDownloadJoined && !installerRunning && (firstAttempt || retryAvailable);
}

bool canStartInstallerAttempt(bool verifiedDownload, bool downloadWorkerJoined,
                              bool installerRunning) {
    return verifiedDownload && downloadWorkerJoined && !installerRunning;
}

WorkerDelivery deliverWorkerMessage(void* message, WorkerMessageSink post,
                                    WorkerMessageSink fallback, void* context) {
    if (!message || !post) return WorkerDelivery::Failed;
    if (post(message, context)) return WorkerDelivery::Posted;
    return fallback && fallback(message, context)
        ? WorkerDelivery::FallbackQueued
        : WorkerDelivery::Failed;
}

PinnedPayloadResult validatePinnedPayload(const std::wstring& path, std::uint64_t expectedBytes,
                                          const std::string& expectedSha256,
                                          const std::wstring& expectedPublisherThumbprint,
                                          FileSizeReader readFileSize, Sha256Reader readSha256,
                                          PublisherThumbprintReader readTrustedPublisher,
                                          void* context) {
    if (path.empty() || expectedBytes == 0 || !hasOnlyHex(expectedSha256, 64) ||
        !hasOnlyHex(expectedPublisherThumbprint, 40) || !readFileSize || !readSha256 || !readTrustedPublisher) {
        return PinnedPayloadResult::InvalidPin;
    }

    std::uint64_t actualBytes = 0;
    if (!readFileSize(path, actualBytes, context)) return PinnedPayloadResult::FileSizeUnavailable;
    if (actualBytes != expectedBytes) return PinnedPayloadResult::FileSizeMismatch;

    std::string actualSha256;
    if (!readSha256(path, actualSha256, context)) return PinnedPayloadResult::HashUnavailable;
    if (!hasOnlyHex(actualSha256, 64) || !equalsAsciiInsensitive(actualSha256, expectedSha256)) {
        return PinnedPayloadResult::HashMismatch;
    }

    std::wstring actualPublisher;
    if (!readTrustedPublisher(path, actualPublisher, context)) return PinnedPayloadResult::PublisherUntrusted;
    if (!hasOnlyHex(actualPublisher, 40) || !equalsWideInsensitive(actualPublisher, expectedPublisherThumbprint)) {
        return PinnedPayloadResult::PublisherMismatch;
    }
    return PinnedPayloadResult::Accepted;
}

bool normalizeInstallDirectory(const std::wstring& input, std::wstring& normalized) {
    normalized.clear();
    if (input.size() < 3 || input.size() >= MAX_PATH - 32 ||
        !iswalpha(input[0]) || input[1] != L':' || (input[2] != L'\\' && input[2] != L'/')) return false;
    for (wchar_t ch : input) {
        if (ch < 0x20 || ch == L'"' || ch == L'<' || ch == L'>' || ch == L'|' || ch == L'?' || ch == L'*') return false;
    }
    DWORD needed = GetFullPathNameW(input.c_str(), 0, nullptr, nullptr);
    if (needed == 0 || needed >= MAX_PATH - 32) return false;
    std::wstring full(needed, L'\0');
    DWORD written = GetFullPathNameW(input.c_str(), needed, full.data(), nullptr);
    if (written == 0 || written >= needed || full[1] != L':' || full[2] != L'\\') return false;
    full.resize(written);
    while (full.size() > 3 && (full.back() == L'\\' || full.back() == L'/')) full.pop_back();
    normalized = std::move(full);
    return true;
}

bool buildNsisCommandLine(const std::wstring& setupPath, const std::wstring& installDirectory,
                          std::wstring& commandLine) {
    std::wstring normalized;
    if (setupPath.empty() || setupPath.find(L'"') != std::wstring::npos ||
        setupPath.find_first_of(L"\r\n") != std::wstring::npos ||
        !normalizeInstallDirectory(installDirectory, normalized) || normalized != installDirectory) return false;
    commandLine = L"\"" + setupPath + L"\" /currentuser /S /D=" + installDirectory;
    return true;
}

bool readPerUserInstallLocation(InstallLocationLookup lookup, void* context, std::wstring& path) {
    path.clear();
    if (!lookup) return false;
    std::wstring candidate;
    if (!lookup(kInstallRegistryKey, L"InstallLocation", candidate, context)) return false;
    std::wstring normalized;
    if (!normalizeInstallDirectory(candidate, normalized)) return false;
    path = std::move(normalized);
    return true;
}
}
