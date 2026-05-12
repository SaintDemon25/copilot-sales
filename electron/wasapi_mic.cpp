/*
 * WASAPI Microphone Capture — captures mic audio and writes s16le mono PCM to stdout.
 *
 * Compile: cl /EHsc /O2 wasapi_mic.cpp /link ole32.lib
 * Usage: wasapi_mic.exe
 *   - Captures from default microphone (eCapture, eConsole)
 *   - Writes s16le 1ch PCM to stdout
 *   - Prints sample rate on stderr: "RATE 48000\n"
 *   - Reads "STOP" from stdin to quit
 */

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <io.h>
#include <algorithm>

static inline int16_t float_to_s16(float v) {
    float clamped = std::max(-1.0f, std::min(1.0f, v));
    return (int16_t)(clamped * 32767.0f);
}

int main() {
    _setmode(_fileno(stdout), _O_BINARY);

    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) { fprintf(stderr, "ERROR CoInit 0x%08x\n", hr); return 1; }

    IMMDeviceEnumerator* pEnum = nullptr;
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                          __uuidof(IMMDeviceEnumerator), (void**)&pEnum);
    if (FAILED(hr)) { fprintf(stderr, "ERROR Enum 0x%08x\n", hr); CoUninitialize(); return 1; }

    IMMDevice* pDev = nullptr;
    hr = pEnum->GetDefaultAudioEndpoint(eCapture, eConsole, &pDev);
    pEnum->Release();
    if (FAILED(hr)) { fprintf(stderr, "ERROR Device 0x%08x\n", hr); CoUninitialize(); return 1; }

    IAudioClient* pAC = nullptr;
    hr = pDev->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&pAC);
    pDev->Release();
    if (FAILED(hr)) { fprintf(stderr, "ERROR Activate 0x%08x\n", hr); CoUninitialize(); return 1; }

    WAVEFORMATEX* pMix = nullptr;
    hr = pAC->GetMixFormat(&pMix);
    if (FAILED(hr)) { fprintf(stderr, "ERROR MixFormat 0x%08x\n", hr); pAC->Release(); CoUninitialize(); return 1; }

    DWORD sampleRate = pMix->nSamplesPerSec;
    WORD srcChannels = pMix->nChannels;
    bool isFloat = (pMix->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) ||
                   (pMix->wFormatTag == WAVE_FORMAT_EXTENSIBLE);
    WORD srcBits = pMix->wBitsPerSample;

    fprintf(stderr, "RATE %u\n", sampleRate);
    fprintf(stderr, "INFO: mic src=%dHz %dch %dbits float=%d\n", sampleRate, srcChannels, srcBits, isFloat);
    fflush(stderr);

    // Shared mode, no loopback — regular capture
    hr = pAC->Initialize(AUDCLNT_SHAREMODE_SHARED, 0,
                         10000000, 0, pMix, nullptr);
    CoTaskMemFree(pMix);
    if (FAILED(hr)) { fprintf(stderr, "ERROR Init 0x%08x\n", hr); pAC->Release(); CoUninitialize(); return 1; }

    IAudioCaptureClient* pCC = nullptr;
    hr = pAC->GetService(__uuidof(IAudioCaptureClient), (void**)&pCC);
    if (FAILED(hr)) { fprintf(stderr, "ERROR Capture 0x%08x\n", hr); pAC->Release(); CoUninitialize(); return 1; }

    hr = pAC->Start();
    if (FAILED(hr)) { fprintf(stderr, "ERROR Start 0x%08x\n", hr); pCC->Release(); pAC->Release(); CoUninitialize(); return 1; }

    fprintf(stderr, "INFO: Capturing mic\n"); fflush(stderr);

    const size_t OUT_BUF_FRAMES = 4096;
    int16_t outBuf[OUT_BUF_FRAMES];

    bool running = true;
    while (running) {
        HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);
        DWORD avail = 0;
        if (PeekNamedPipe(hStdin, nullptr, 0, nullptr, &avail, nullptr) && avail > 0) {
            char buf[64] = {};
            DWORD rd = 0;
            if (ReadFile(hStdin, buf, sizeof(buf)-1, &rd, nullptr) && rd > 0 && strstr(buf, "STOP")) {
                running = false;
                break;
            }
        }

        UINT32 pktLen = 0;
        hr = pCC->GetNextPacketSize(&pktLen);
        if (FAILED(hr)) break;

        while (pktLen > 0) {
            BYTE* pData = nullptr;
            UINT32 frames = 0;
            DWORD flags = 0;
            hr = pCC->GetBuffer(&pData, &frames, &flags, nullptr, nullptr);
            if (FAILED(hr)) break;

            if (frames > 0 && pData && !(flags & AUDCLNT_BUFFERFLAGS_SILENT)) {
                UINT32 outIdx = 0;
                if (isFloat && srcBits == 32) {
                    float* src = (float*)pData;
                    for (UINT32 f = 0; f < frames && outIdx < OUT_BUF_FRAMES; f++) {
                        float* frame = src + f * srcChannels;
                        // Mono: average all channels
                        float sum = 0;
                        for (WORD c = 0; c < srcChannels; c++) sum += frame[c];
                        outBuf[outIdx++] = float_to_s16(sum / srcChannels);
                    }
                } else if (srcBits == 16) {
                    int16_t* src = (int16_t*)pData;
                    for (UINT32 f = 0; f < frames && outIdx < OUT_BUF_FRAMES; f++) {
                        int16_t* frame = src + f * srcChannels;
                        int32_t sum = 0;
                        for (WORD c = 0; c < srcChannels; c++) sum += frame[c];
                        outBuf[outIdx++] = (int16_t)(sum / srcChannels);
                    }
                } else {
                    for (UINT32 f = 0; f < frames && outIdx < OUT_BUF_FRAMES; f++) {
                        outBuf[outIdx++] = 0;
                    }
                }

                if (outIdx > 0) {
                    fwrite(outBuf, sizeof(int16_t), outIdx, stdout);
                }
            }

            pCC->ReleaseBuffer(frames);
            hr = pCC->GetNextPacketSize(&pktLen);
            if (FAILED(hr)) break;
        }

        fflush(stdout);
        Sleep(10);
    }

    pAC->Stop();
    pCC->Release();
    pAC->Release();
    CoUninitialize();

    fprintf(stderr, "INFO: Stopped\n"); fflush(stderr);
    return 0;
}
