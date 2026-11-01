#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <shlguid.h>
#include <shlwapi.h>
#include <string>
#include <atomic>

// In-process code is limited to menu metadata. Conversion always runs in a separate process.
static HMODULE moduleHandle;
static std::atomic<long> references{0};
static const CLSID ForgeClsid = {0x761ca256,0x61cc,0x4b1e,{0x85,0xdb,0x2f,0x7d,0x4e,0x83,0x70,0x10}};
static const CLSID YtypClsid = {0x65b5221f,0x8946,0x4de3,{0x9f,0x6b,0x94,0xb8,0x31,0xf3,0x94,0x32}};

static void folderFromView(IFolderView* view, IShellItem** item) {
    if (SUCCEEDED(view->GetFolder(IID_PPV_ARGS(item)))) return;
    IPersistFolder2* persistent = nullptr;
    if (SUCCEEDED(view->GetFolder(IID_PPV_ARGS(&persistent)))) {
        PIDLIST_ABSOLUTE id = nullptr;
        if (SUCCEEDED(persistent->GetCurFolder(&id))) {
            SHCreateItemFromIDList(id, IID_PPV_ARGS(item));
            CoTaskMemFree(id);
        }
        persistent->Release();
    }
}

static std::wstring appRoot() {
    wchar_t buffer[32768];
    DWORD length = GetModuleFileNameW(moduleHandle, buffer, 32768);
    if (!length || length >= 32768) return {};
    std::wstring value(buffer, length);
    value.resize(value.find_last_of(L"\\/")); // shell directory
    value.resize(value.find_last_of(L"\\/")); // app directory
    return value;
}

class ForgeCommand final : public IExplorerCommand, public IObjectWithSite {
    std::atomic<ULONG> count{1};
    bool ytyp;
    IUnknown* site = nullptr;
    HRESULT folder(IShellItemArray* selection, std::wstring& result) {
        IShellItem* item = nullptr;
        DWORD size = 0;
        if (selection && SUCCEEDED(selection->GetCount(&size)) && size == 1) selection->GetItemAt(0, &item);
        if (!item && site) {
            IServiceProvider* services = nullptr;
            if (SUCCEEDED(site->QueryInterface(IID_PPV_ARGS(&services)))) {
                IFolderView* view = nullptr;
                if (SUCCEEDED(services->QueryService(SID_SFolderView, IID_PPV_ARGS(&view)))) {
                    folderFromView(view, &item);
                    view->Release();
                }
                if (!item) {
                    IShellBrowser* browser = nullptr;
                    if (SUCCEEDED(services->QueryService(SID_STopLevelBrowser, IID_PPV_ARGS(&browser)))) {
                        IShellView* shellView = nullptr;
                        if (SUCCEEDED(browser->QueryActiveShellView(&shellView))) {
                            IFolderView* folderView = nullptr;
                            if (SUCCEEDED(shellView->QueryInterface(IID_PPV_ARGS(&folderView)))) {
                                folderFromView(folderView, &item);
                                folderView->Release();
                            }
                            shellView->Release();
                        }
                        browser->Release();
                    }
                }
                services->Release();
            }
        }
        if (!item) return E_FAIL;
        SFGAOF attrs = 0;
        HRESULT hr = item->GetAttributes(SFGAO_FILESYSTEM | SFGAO_FOLDER, &attrs);
        if (FAILED(hr) || (attrs & (SFGAO_FILESYSTEM | SFGAO_FOLDER)) != (SFGAO_FILESYSTEM | SFGAO_FOLDER)) { item->Release(); return E_INVALIDARG; }
        PWSTR value = nullptr;
        hr = item->GetDisplayName(SIGDN_FILESYSPATH, &value);
        if (SUCCEEDED(hr)) { result = value; CoTaskMemFree(value); }
        item->Release();
        return hr;
    }
public:
    ForgeCommand(bool generate) : ytyp(generate) { ++references; }
    ~ForgeCommand() { if (site) site->Release(); --references; }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** output) override {
        if (!output) return E_POINTER;
        *output = nullptr;
        if (id == IID_IUnknown || id == IID_IExplorerCommand) *output = static_cast<IExplorerCommand*>(this);
        else if (id == IID_IObjectWithSite) *output = static_cast<IObjectWithSite*>(this);
        else return E_NOINTERFACE;
        AddRef(); return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++count; }
    ULONG STDMETHODCALLTYPE Release() override { ULONG n = --count; if (!n) delete this; return n; }
    HRESULT STDMETHODCALLTYPE SetSite(IUnknown* value) override { if (value) value->AddRef(); if (site) site->Release(); site = value; return S_OK; }
    HRESULT STDMETHODCALLTYPE GetSite(REFIID id, void** output) override { if (!output) return E_POINTER; *output = nullptr; return site ? site->QueryInterface(id, output) : E_FAIL; }
    HRESULT STDMETHODCALLTYPE GetTitle(IShellItemArray* items, PWSTR* value) override {
        return SHStrDupW(ytyp ? L"Gerar YTYP com RPForge" : L"Converter com RPForge", value);
    }
    HRESULT STDMETHODCALLTYPE GetIcon(IShellItemArray*, PWSTR* value) override { return SHStrDupW((appRoot() + L"\\shell\\rpforge-mark-v3.ico,0").c_str(), value); }
    HRESULT STDMETHODCALLTYPE GetToolTip(IShellItemArray*, PWSTR* value) override { return SHStrDupW(L"RPForge: converter RPFs ou gerar YTYPs de modelos YDR", value); }
    HRESULT STDMETHODCALLTYPE GetCanonicalName(GUID* value) override { if (!value) return E_POINTER; *value = ytyp ? YtypClsid : ForgeClsid; return S_OK; }
    HRESULT STDMETHODCALLTYPE GetState(IShellItemArray* items, BOOL slow, EXPCMDSTATE* value) override {
        if (!value) return E_POINTER;
        *value = ECS_HIDDEN;
        if (!slow) return E_PENDING;
        std::wstring directory;
        if (FAILED(folder(items, directory))) return S_OK;
        WIN32_FIND_DATAW entry;
        for (const auto pattern : { ytyp ? L"\\*.ydr" : L"\\*.rpf" }) {
          HANDLE search = FindFirstFileW((directory + pattern).c_str(), &entry);
          if (search != INVALID_HANDLE_VALUE) {
            do { if (!(entry.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT))) { *value = ECS_ENABLED; break; } } while (FindNextFileW(search, &entry));
            FindClose(search);
          }
          if (*value == ECS_ENABLED) break;
        }
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE Invoke(IShellItemArray* items, IBindCtx*) override {
        std::wstring directory;
        HRESULT hr = folder(items, directory);
        if (FAILED(hr)) return hr;
        const auto root = appRoot();
        const auto executable = root + L"\\RPFForge.exe";
        // A trailing backslash must be doubled before the closing argument quote.
        std::wstring escaped = directory;
        if (!escaped.empty() && escaped.back() == L'\\') escaped += L'\\';
        std::wstring command = L"\"" + executable + L"\" " + (ytyp ? L"--ytyp " : L"") + L"\"" + escaped + L"\"";
        STARTUPINFOW startup{sizeof(startup)};
        PROCESS_INFORMATION process{};
        if (!CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, FALSE, 0, nullptr, root.c_str(), &startup, &process)) return HRESULT_FROM_WIN32(GetLastError());
        CloseHandle(process.hThread); CloseHandle(process.hProcess);
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GetFlags(EXPCMDFLAGS* value) override { if (!value) return E_POINTER; *value = ECF_DEFAULT; return S_OK; }
    HRESULT STDMETHODCALLTYPE EnumSubCommands(IEnumExplorerCommand** value) override { if (!value) return E_POINTER; *value = nullptr; return E_NOTIMPL; }
};

class Factory final : public IClassFactory {
    std::atomic<ULONG> count{1};
    bool ytyp;
public:
    Factory(bool generate) : ytyp(generate) { ++references; }
    ~Factory() { --references; }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** output) override {
        if (!output) return E_POINTER; *output = nullptr;
        if (id != IID_IUnknown && id != IID_IClassFactory) return E_NOINTERFACE;
        *output = static_cast<IClassFactory*>(this); AddRef(); return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++count; }
    ULONG STDMETHODCALLTYPE Release() override { ULONG n = --count; if (!n) delete this; return n; }
    HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* outer, REFIID id, void** output) override {
        if (outer) return CLASS_E_NOAGGREGATION;
        auto command = new ForgeCommand(ytyp); auto hr = command->QueryInterface(id, output); command->Release(); return hr;
    }
    HRESULT STDMETHODCALLTYPE LockServer(BOOL lock) override { if (lock) ++references; else --references; return S_OK; }
};

extern "C" __declspec(dllexport) HRESULT WINAPI DllGetClassObject(REFCLSID clsid, REFIID id, void** output) {
    if (clsid != ForgeClsid && clsid != YtypClsid) return CLASS_E_CLASSNOTAVAILABLE;
    auto factory = new Factory(clsid == YtypClsid); auto hr = factory->QueryInterface(id, output); factory->Release(); return hr;
}
extern "C" __declspec(dllexport) HRESULT WINAPI DllCanUnloadNow() { return references == 0 ? S_OK : S_FALSE; }
BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) { if (reason == DLL_PROCESS_ATTACH) { moduleHandle = instance; DisableThreadLibraryCalls(instance); } return TRUE; }
