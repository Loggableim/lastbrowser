#pragma once

#include <windows.h>
#include <winhttp.h>
#include <cstdint>
#include <string>

namespace bootstrapper_core {
inline constexpr wchar_t kInstallRegistryKey[] = L"Software\\e01786d4-bdcb-5140-a133-efc73f0357d3";

using SetOptionFn = BOOL(WINAPI*)(HINTERNET, DWORD, LPVOID, DWORD);
using SetTimeoutsFn = BOOL(WINAPI*)(HINTERNET, int, int, int, int);
bool configureHttpSession(HINTERNET session, SetOptionFn setOption, SetTimeoutsFn setTimeouts);
bool isAllowedRedirectHost(const std::wstring& host);

struct ParsedHttpsUrl {
    std::wstring host;
    std::wstring path;
    std::wstring extraInfo;
    INTERNET_PORT port{};
};

enum class HttpResponseAction { Reject, ReadBody, FollowRedirect };
bool parseAllowedHttpsUrl(const std::wstring& url, ParsedHttpsUrl& parsed);
bool resolveAllowedHttpsRedirect(const std::wstring& baseUrl, const std::wstring& location,
                                 std::wstring& resolvedUrl);
HttpResponseAction validateHttpResponse(DWORD status, const std::wstring& baseUrl,
                                        const std::wstring& location,
                                        unsigned redirectsFollowed, unsigned maximumRedirects,
                                        std::wstring& redirectTarget);
bool isCurrentAttempt(DWORD messageAttemptId, DWORD currentAttemptId);
bool canStartDownloadAttempt(bool firstAttempt, bool retryAvailable,
                             bool previousDownloadJoined, bool installerRunning);
bool canStartInstallerAttempt(bool verifiedDownload, bool downloadWorkerJoined,
                              bool installerRunning);
enum class WorkerDelivery { Posted, FallbackQueued, Failed };
using WorkerMessageSink = bool(*)(void* message, void* context);
WorkerDelivery deliverWorkerMessage(void* message, WorkerMessageSink post,
                                    WorkerMessageSink fallback, void* context);

enum class PinnedPayloadResult {
    Accepted,
    InvalidPin,
    FileSizeUnavailable,
    FileSizeMismatch,
    HashUnavailable,
    HashMismatch,
    PublisherUntrusted,
    PublisherMismatch
};
using FileSizeReader = bool(*)(const std::wstring& path, std::uint64_t& bytes, void* context);
using Sha256Reader = bool(*)(const std::wstring& path, std::string& digest, void* context);
using PublisherThumbprintReader = bool(*)(const std::wstring& path, std::wstring& thumbprint, void* context);
PinnedPayloadResult validatePinnedPayload(const std::wstring& path, std::uint64_t expectedBytes,
                                          const std::string& expectedSha256,
                                          const std::wstring& expectedPublisherThumbprint,
                                          FileSizeReader readFileSize, Sha256Reader readSha256,
                                          PublisherThumbprintReader readTrustedPublisher,
                                          void* context);

bool normalizeInstallDirectory(const std::wstring& input, std::wstring& normalized);
bool buildNsisCommandLine(const std::wstring& setupPath, const std::wstring& installDirectory,
                         std::wstring& commandLine);

using InstallLocationLookup = bool(*)(const wchar_t* key, const wchar_t* valueName,
                                      std::wstring& value, void* context);
bool readPerUserInstallLocation(InstallLocationLookup lookup, void* context, std::wstring& path);
}
