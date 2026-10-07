#include "../bootstrapper_core.h"
#include <iostream>
#include <string>

namespace {
struct HttpMock { bool optionResult{true}; bool timeoutResult{true}; int optionCalls{}; int timeoutCalls{}; };
HttpMock* activeHttpMock{};
BOOL WINAPI mockSetOption(HINTERNET, DWORD option, LPVOID value, DWORD bytes) {
    ++activeHttpMock->optionCalls;
    return option == WINHTTP_OPTION_REDIRECT_POLICY && bytes == sizeof(DWORD) &&
           *static_cast<DWORD*>(value) == WINHTTP_OPTION_REDIRECT_POLICY_NEVER && activeHttpMock->optionResult;
}
BOOL WINAPI mockSetTimeouts(HINTERNET, int resolve, int connect, int send, int receive) {
    ++activeHttpMock->timeoutCalls;
    return resolve == 15000 && connect == 15000 && send == 30000 && receive == 2000 && activeHttpMock->timeoutResult;
}
struct RegistryMock { bool called{}; std::wstring key; std::wstring name; };
bool mockRegistryLookup(const wchar_t* key, const wchar_t* name, std::wstring& value, void* context) {
    auto* mock = static_cast<RegistryMock*>(context);
    mock->called = true; mock->key = key; mock->name = name;
    value = L"C:\\Users\\Unit Test\\AppData\\Local\\Programs\\Lastbrowser";
    return true;
}
struct PayloadFixture {
    std::uint64_t bytes{174778024ULL};
    std::string sha256 = std::string(64, 'a');
    std::wstring publisher{L"1AD3C19A7338BBC3FFE4D62853411AD73E139857"};
    bool sizeAvailable{true};
    bool hashAvailable{true};
    bool publisherTrusted{true};
    int sizeReads{};
    int hashReads{};
    int publisherReads{};
};
struct DeliveryFixture {
    bool postSucceeds{};
    bool fallbackSucceeds{};
    int postCalls{};
    int fallbackCalls{};
    void* observedMessage{};
};
bool mockPostWorkerMessage(void* message, void* context) {
    auto* fixture = static_cast<DeliveryFixture*>(context);
    ++fixture->postCalls;
    fixture->observedMessage = message;
    return fixture->postSucceeds;
}
bool mockQueueWorkerFallback(void* message, void* context) {
    auto* fixture = static_cast<DeliveryFixture*>(context);
    ++fixture->fallbackCalls;
    fixture->observedMessage = message;
    return fixture->fallbackSucceeds;
}
bool mockFileSize(const std::wstring&, std::uint64_t& bytes, void* context) {
    auto* fixture = static_cast<PayloadFixture*>(context);
    ++fixture->sizeReads;
    bytes = fixture->bytes;
    return fixture->sizeAvailable;
}
bool mockSha256(const std::wstring&, std::string& digest, void* context) {
    auto* fixture = static_cast<PayloadFixture*>(context);
    ++fixture->hashReads;
    digest = fixture->sha256;
    return fixture->hashAvailable;
}
bool mockTrustedPublisher(const std::wstring&, std::wstring& thumbprint, void* context) {
    auto* fixture = static_cast<PayloadFixture*>(context);
    ++fixture->publisherReads;
    thumbprint = fixture->publisher;
    return fixture->publisherTrusted;
}
int failures{};
void check(bool condition, const char* label) {
    if (!condition) { std::cerr << "FAIL: " << label << "\n"; ++failures; }
}
}

int wmain() {
    using namespace bootstrapper_core;
    HttpMock http; activeHttpMock = &http;
    check(configureHttpSession(reinterpret_cast<HINTERNET>(1), mockSetOption, mockSetTimeouts), "HTTP session options accepted");
    check(http.optionCalls == 1 && http.timeoutCalls == 1, "both HTTP protections configured before requests");
    http = {}; http.optionResult = false; activeHttpMock = &http;
    check(!configureHttpSession(reinterpret_cast<HINTERNET>(1), mockSetOption, mockSetTimeouts) && http.timeoutCalls == 0,
          "redirect-policy failure blocks session");
    http = {}; http.timeoutResult = false; activeHttpMock = &http;
    check(!configureHttpSession(reinterpret_cast<HINTERNET>(1), mockSetOption, mockSetTimeouts), "timeout failure blocks session");
    check(!configureHttpSession(nullptr, mockSetOption, mockSetTimeouts), "null session fails closed");

    check(isAllowedRedirectHost(L"github.com") && isAllowedRedirectHost(L"RELEASE-ASSETS.GITHUBUSERCONTENT.COM"),
          "allowlisted redirect hosts accepted case-insensitively");
    check(!isAllowedRedirectHost(L"github.com.attacker.invalid") && !isAllowedRedirectHost(L"attacker.invalid"),
          "untrusted redirect hosts rejected");

    ParsedHttpsUrl parsed{};
    check(parseAllowedHttpsUrl(L"https://github.com/Loggableim/lastbrowser/releases/latest", parsed) &&
          parsed.host == L"github.com" && parsed.port == INTERNET_DEFAULT_HTTPS_PORT,
          "pinned HTTPS endpoint is parsed and allowlisted");
    check(!parseAllowedHttpsUrl(L"http://github.com/releases/latest", parsed) &&
          !parseAllowedHttpsUrl(L"https://github.com.attacker.invalid/releases/latest", parsed) &&
          !parseAllowedHttpsUrl(L"https://attacker@github.com/releases/latest", parsed) &&
          !parseAllowedHttpsUrl(L"https://github.com:444/releases/latest", parsed),
          "non-HTTPS, foreign, user-info, and nonstandard-port endpoints fail closed");

    std::wstring redirect;
    check(validateHttpResponse(200, L"https://github.com/releases/tag", L"", 0, 5, redirect) ==
          HttpResponseAction::ReadBody && redirect.empty(), "only HTTP 200 is accepted as payload body");
    check(validateHttpResponse(302, L"https://github.com/owner/repo/file", 
          L"https://release-assets.githubusercontent.com/assets/test", 0, 5, redirect) ==
          HttpResponseAction::FollowRedirect && redirect == L"https://release-assets.githubusercontent.com/assets/test",
          "real redirect response fixture follows allowed HTTPS asset host");
    check(validateHttpResponse(301, L"https://github.com/owner/repo/file", L"/releases/latest", 0, 5, redirect) ==
          HttpResponseAction::FollowRedirect && redirect == L"https://github.com/releases/latest",
          "relative redirect response resolves through the product validator");
    check(validateHttpResponse(302, L"https://github.com/owner/repo/file",
          L"https://github.com.attacker.invalid/payload", 0, 5, redirect) == HttpResponseAction::Reject && redirect.empty(),
          "foreign absolute redirect response is rejected");
    check(validateHttpResponse(302, L"https://github.com/owner/repo/file",
          L"http://release-assets.githubusercontent.com/payload", 0, 5, redirect) == HttpResponseAction::Reject,
          "HTTP downgrade redirect response is rejected");
    check(validateHttpResponse(302, L"https://github.com/owner/repo/file", L"", 0, 5, redirect) ==
          HttpResponseAction::Reject &&
          validateHttpResponse(302, L"https://github.com/owner/repo/file", L"/too-many", 5, 5, redirect) ==
          HttpResponseAction::Reject, "missing Location and redirect-hop overflow are rejected");
    check(validateHttpResponse(204, L"https://github.com/owner/repo/file", L"", 0, 5, redirect) ==
          HttpResponseAction::Reject &&
          validateHttpResponse(304, L"https://github.com/owner/repo/file", L"/cached", 0, 5, redirect) ==
          HttpResponseAction::Reject &&
          validateHttpResponse(500, L"https://github.com/owner/repo/file", L"", 0, 5, redirect) ==
          HttpResponseAction::Reject, "unexpected success, not-modified, and server status codes are rejected");

    check(canStartDownloadAttempt(true, false, true, false), "first download may start when no worker is active");
    check(!canStartDownloadAttempt(true, false, false, false) &&
          !canStartDownloadAttempt(false, true, false, false),
          "download and retry wait until the previous worker is joined");
    check(canStartDownloadAttempt(false, true, true, false) &&
          !canStartDownloadAttempt(false, false, true, false) &&
          !canStartDownloadAttempt(false, true, true, true),
          "only an explicit retryable download failure can start a new attempt");
    check(canStartInstallerAttempt(true, true, false) &&
          !canStartInstallerAttempt(true, false, false) &&
          !canStartInstallerAttempt(true, true, true),
          "installer dispatch requires a joined verified download and no active installer");
    check(isCurrentAttempt(7, 7) && !isCurrentAttempt(6, 7) && !isCurrentAttempt(0, 0),
          "late worker messages from an earlier attempt are rejected");

    int workerMessageToken = 42;
    DeliveryFixture delivery{true, true};
    check(deliverWorkerMessage(&workerMessageToken, mockPostWorkerMessage, mockQueueWorkerFallback, &delivery) ==
              WorkerDelivery::Posted && delivery.postCalls == 1 && delivery.fallbackCalls == 0 &&
              delivery.observedMessage == &workerMessageToken,
          "normal worker result is posted without entering fallback");
    delivery = {false, true};
    check(deliverWorkerMessage(&workerMessageToken, mockPostWorkerMessage, mockQueueWorkerFallback, &delivery) ==
              WorkerDelivery::FallbackQueued && delivery.postCalls == 1 && delivery.fallbackCalls == 1 &&
              delivery.observedMessage == &workerMessageToken,
          "failed terminal post is delivered through the shared completion fallback");
    delivery = {false, false};
    check(deliverWorkerMessage(&workerMessageToken, mockPostWorkerMessage, mockQueueWorkerFallback, &delivery) ==
              WorkerDelivery::Failed,
          "worker result reports failure only when both post and fallback sinks fail");
    check(deliverWorkerMessage(nullptr, mockPostWorkerMessage, mockQueueWorkerFallback, &delivery) ==
              WorkerDelivery::Failed,
          "null worker result cannot be silently treated as delivered");

    const std::string expectedHash(64, 'a');
    const std::wstring expectedPublisher = L"1AD3C19A7338BBC3FFE4D62853411AD73E139857";
    PayloadFixture payloadFixture{};
    const auto acceptedPayload = validatePinnedPayload(L"fixture.exe", 174778024ULL, expectedHash, expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture);
    check(acceptedPayload == PinnedPayloadResult::Accepted,
          "the actual pinned-payload contract accepts matching size, SHA-256, and trusted publisher");

    payloadFixture = {}; payloadFixture.bytes--;
    check(validatePinnedPayload(L"fixture.exe", 174778024ULL, expectedHash, expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture) == PinnedPayloadResult::FileSizeMismatch &&
          payloadFixture.hashReads == 0 && payloadFixture.publisherReads == 0,
          "wrong payload size fails closed before hash or publisher checks");
    payloadFixture = {}; payloadFixture.sha256 = std::string(64, 'b');
    check(validatePinnedPayload(L"fixture.exe", 174778024ULL, expectedHash, expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture) == PinnedPayloadResult::HashMismatch &&
          payloadFixture.publisherReads == 0, "wrong payload SHA-256 fails closed before publisher check");
    payloadFixture = {}; payloadFixture.publisherTrusted = false;
    check(validatePinnedPayload(L"fixture.exe", 174778024ULL, expectedHash, expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture) == PinnedPayloadResult::PublisherUntrusted,
          "an invalid Authenticode trust result fails closed");
    payloadFixture = {}; payloadFixture.publisher = L"2AD3C19A7338BBC3FFE4D62853411AD73E139857";
    check(validatePinnedPayload(L"fixture.exe", 174778024ULL, expectedHash, expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture) == PinnedPayloadResult::PublisherMismatch,
          "a trusted signature from the wrong pinned publisher fails closed");
    payloadFixture = {}; payloadFixture.hashAvailable = false;
    check(validatePinnedPayload(L"fixture.exe", 174778024ULL, expectedHash, expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture) == PinnedPayloadResult::HashUnavailable,
          "hash-provider failure fails closed");
    payloadFixture = {}; payloadFixture.sizeAvailable = false;
    check(validatePinnedPayload(L"fixture.exe", 174778024ULL, expectedHash, expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture) == PinnedPayloadResult::FileSizeUnavailable,
          "file-size read failure fails closed");
    payloadFixture = {};
    check(validatePinnedPayload(L"fixture.exe", 174778024ULL, "bad-pin", expectedPublisher,
          mockFileSize, mockSha256, mockTrustedPublisher, &payloadFixture) == PinnedPayloadResult::InvalidPin &&
          payloadFixture.sizeReads == 0, "invalid pin input fails before filesystem access");

    std::wstring normalized;
    check(normalizeInstallDirectory(L"C:\\Program Files\\Lastbrowser", normalized) &&
          normalized == L"C:\\Program Files\\Lastbrowser", "spaced absolute install directory normalized");
    check(!normalizeInstallDirectory(L"relative\\Lastbrowser", normalized), "relative install path rejected");
    check(!normalizeInstallDirectory(L"\\\\server\\share\\Lastbrowser", normalized), "UNC install path rejected");
    check(!normalizeInstallDirectory(L"C:\\Unsafe\" /S /D=C:\\other", normalized), "quote/argument injection rejected");

    std::wstring command;
    check(buildNsisCommandLine(L"C:\\Users\\Unit Test\\AppData\\Temp\\payload.exe",
          L"C:\\Program Files\\Lastbrowser", command), "NSIS command accepts validated spaced paths");
    check(command == L"\"C:\\Users\\Unit Test\\AppData\\Temp\\payload.exe\" /currentuser /S /D=C:\\Program Files\\Lastbrowser",
          "NSIS path is final, unquoted /D argument");
    check(!buildNsisCommandLine(L"C:\\payload.exe", L"C:\\Bad\"Path", command), "unsafe NSIS path rejected");

    RegistryMock registry{}; std::wstring installPath;
    check(readPerUserInstallLocation(mockRegistryLookup, &registry, installPath), "registered install location resolves");
    check(registry.called && registry.key == kInstallRegistryKey && registry.name == L"InstallLocation",
          "lookup uses electron-builder HKCU APP_GUID install key");
    check(installPath == L"C:\\Users\\Unit Test\\AppData\\Local\\Programs\\Lastbrowser",
          "resolved registry location canonicalized");
    if (failures) return 1;
    std::cout << "PASS: HTTP fail-closed setup, redirect allowlist, install path validation, NSIS command, registry key.\n";
    return 0;
}
