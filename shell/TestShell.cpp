#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <shlguid.h>
#include <cstdio>
#include <string>
static const CLSID id = {0x761ca256,0x61cc,0x4b1e,{0x85,0xdb,0x2f,0x7d,0x4e,0x83,0x70,0x10}};
// Mimic Explorer's background site: its folder supports IPersistFolder2, not IShellItem.
class BackgroundSite final : public IServiceProvider, public IFolderView, public IPersistFolder2 {
    ULONG refs = 1;
    std::wstring directory;
public:
    BackgroundSite(const wchar_t* path) : directory(path) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** out) override {
        *out = nullptr;
        if (iid == IID_IUnknown || iid == IID_IServiceProvider) *out = static_cast<IServiceProvider*>(this);
        else if (iid == IID_IFolderView) *out = static_cast<IFolderView*>(this);
        else if (iid == IID_IPersistFolder2) *out = static_cast<IPersistFolder2*>(this);
        else return E_NOINTERFACE;
        AddRef(); return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
    ULONG STDMETHODCALLTYPE Release() override { ULONG n = --refs; if (!n) delete this; return n; }
    HRESULT STDMETHODCALLTYPE QueryService(REFGUID service, REFIID iid, void** out) override { if (service == SID_SFolderView) return QueryInterface(iid,out); *out=nullptr; return E_NOINTERFACE; }
    HRESULT STDMETHODCALLTYPE GetFolder(REFIID iid, void** out) override { return QueryInterface(iid,out); }
    HRESULT STDMETHODCALLTYPE GetCurFolder(PIDLIST_ABSOLUTE* out) override { return SHParseDisplayName(directory.c_str(),nullptr,out,0,nullptr); }
    HRESULT STDMETHODCALLTYPE GetClassID(CLSID*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE Initialize(PCIDLIST_ABSOLUTE) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetCurrentViewMode(UINT*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE SetCurrentViewMode(UINT) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE Item(int,PITEMID_CHILD*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE ItemCount(UINT,int*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE Items(UINT,REFIID,void**) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetSelectionMarkedItem(int*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetFocusedItem(int*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetItemPosition(PCUITEMID_CHILD,POINT*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetSpacing(POINT*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetDefaultSpacing(POINT*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetAutoArrange() override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE SelectItem(int,DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE SelectAndPositionItems(UINT,PCUITEMID_CHILD_ARRAY,POINT*,DWORD) override { return E_NOTIMPL; }
};
int wmain(int argc, wchar_t** argv) {
    if (argc != 4 && argc != 5) return 10;
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    HMODULE dll = LoadLibraryW(argv[1]);
    if (!dll) return 11;
    auto getFactory = reinterpret_cast<HRESULT(WINAPI*)(REFCLSID,REFIID,void**)>(GetProcAddress(dll,"DllGetClassObject"));
    auto canUnload = reinterpret_cast<HRESULT(WINAPI*)()>(GetProcAddress(dll,"DllCanUnloadNow"));
    if (!getFactory || !canUnload || canUnload() != S_OK) return 12;
    IClassFactory* factory = nullptr;
    if (FAILED(getFactory(id,IID_PPV_ARGS(&factory)))) return 13;
    IExplorerCommand* command = nullptr;
    HRESULT creation = argc == 5 ? CoCreateInstance(id,nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&command)) : factory->CreateInstance(nullptr,IID_PPV_ARGS(&command));
    if (FAILED(creation)) { printf("COM activation failed: %08lx\n",static_cast<unsigned long>(creation)); return 14; }
    factory->Release();
    const CLSID ytypId = {0x65b5221f,0x8946,0x4de3,{0x9f,0x6b,0x94,0xb8,0x31,0xf3,0x94,0x32}};
    IExplorerCommand* generator = nullptr;
    if (FAILED(getFactory(ytypId,IID_PPV_ARGS(&factory)))) return 26;
    HRESULT generated = argc == 5 ? CoCreateInstance(ytypId,nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&generator)) : factory->CreateInstance(nullptr,IID_PPV_ARGS(&generator));
    factory->Release();
    if (FAILED(generated)) return 27;
    PWSTR title = nullptr;
    if (FAILED(command->GetTitle(nullptr,&title)) || wcscmp(title,L"Converter com RPForge")) return 15;
    CoTaskMemFree(title);
    PWSTR icon = nullptr;
    if (FAILED(command->GetIcon(nullptr,&icon)) || !wcsstr(icon,L"\\shell\\rpforge-mark-v3.ico,0")) return 16;
    CoTaskMemFree(icon);
    for (int i = 2; i < 4; i++) {
        PIDLIST_ABSOLUTE pidl = nullptr;
        if (FAILED(SHParseDisplayName(argv[i],nullptr,&pidl,0,nullptr))) return 16;
        IShellItemArray* items = nullptr;
        PCIDLIST_ABSOLUTE values[] = {pidl};
        if (FAILED(SHCreateShellItemArrayFromIDLists(1,values,&items))) return 17;
        EXPCMDSTATE state;
        if (command->GetState(items,FALSE,&state) != E_PENDING) return 18;
        if (FAILED(command->GetState(items,TRUE,&state))) return 19;
        if (state != (i == 2 ? ECS_ENABLED : ECS_HIDDEN)) return 20;
        if (FAILED(generator->GetState(items,TRUE,&state)) || state != ECS_HIDDEN) return 28;
        {
            auto model = std::wstring(argv[i]) + L"\\synthetic.ydr";
            HANDLE file = CreateFileW(model.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
            if (file == INVALID_HANDLE_VALUE) return 24;
            CloseHandle(file);
            HRESULT ydrState = generator->GetState(items, TRUE, &state);
            PWSTR ydrTitle = nullptr;
            HRESULT ydrName = generator->GetTitle(items, &ydrTitle);
            bool titleOk = SUCCEEDED(ydrName) && !wcscmp(ydrTitle, L"Gerar YTYP com RPForge");
            CoTaskMemFree(ydrTitle); DeleteFileW(model.c_str());
            if (FAILED(ydrState) || state != ECS_ENABLED || !titleOk) return 25;
        }
        items->Release(); CoTaskMemFree(pidl);
    }
    IObjectWithSite* site = nullptr;
    if (FAILED(command->QueryInterface(IID_PPV_ARGS(&site)))) return 21;
    if (argc == 4) {
        auto background = new BackgroundSite(argv[2]);
        site->SetSite(static_cast<IServiceProvider*>(background));
        background->Release();
        EXPCMDSTATE state;
        if (FAILED(command->GetState(nullptr,TRUE,&state)) || state != ECS_ENABLED) return 23;
        PIDLIST_ABSOLUTE first = nullptr, second = nullptr;
        if (FAILED(SHParseDisplayName(argv[2],nullptr,&first,0,nullptr)) || FAILED(SHParseDisplayName(argv[3],nullptr,&second,0,nullptr))) return 29;
        PCIDLIST_ABSOLUTE paths[] = {first, second};
        IShellItemArray* multiple = nullptr;
        if (FAILED(SHCreateShellItemArrayFromIDLists(2,paths,&multiple))) return 30;
        HRESULT multiState = command->GetState(multiple,TRUE,&state);
        multiple->Release(); CoTaskMemFree(first); CoTaskMemFree(second);
        if (FAILED(multiState) || state != ECS_HIDDEN) return 31;
    }
    site->SetSite(nullptr); site->Release(); command->Release(); generator->Release();
    if (canUnload() != S_OK) return 22;
    FreeLibrary(dll); CoUninitialize();
    puts("PASS: COM factory, lifetime, title, async state, RPF folder visible, empty folder hidden and folder background site.");
    return 0;
}
