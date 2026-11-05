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
#include "ToolAccess.h"
static const CLSID id = {0x761ca256,0x61cc,0x4b1e,{0x85,0xdb,0x2f,0x7d,0x4e,0x83,0x70,0x10}};
class IsolatedAccess {
 HKEY key=nullptr;std::wstring location;
public:
 bool enabled=false;ULONGLONG now=0;std::wstring root;
 IsolatedAccess(const wchar_t* dll,bool isolate){
  wchar_t full[32768];GetFullPathNameW(dll,32768,full,nullptr);root=full;root.resize(root.find_last_of(L"\\/"));root.resize(root.find_last_of(L"\\/"));
  FILETIME ft;GetSystemTimeAsFileTime(&ft);ULARGE_INTEGER value;value.LowPart=ft.dwLowDateTime;value.HighPart=ft.dwHighDateTime;now=value.QuadPart/10000000ULL-11644473600ULL;
  if(!isolate)return;location=L"Software\\RPForge\\ShellTests\\"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64());
  if(RegCreateKeyExW(HKEY_CURRENT_USER,location.c_str(),0,nullptr,0,KEY_ALL_ACCESS,nullptr,&key,nullptr)==ERROR_SUCCESS)enabled=RegOverridePredefKey(HKEY_CURRENT_USER,key)==ERROR_SUCCESS;
 }
 void set(DWORD mask,ULONGLONG expires,const std::wstring& owner){HKEY access;RegCreateKeyExW(HKEY_CURRENT_USER,L"Software\\RPForge\\ToolAccess",0,nullptr,0,KEY_ALL_ACCESS,nullptr,&access,nullptr);RegSetValueExW(access,L"Mask",0,REG_DWORD,reinterpret_cast<const BYTE*>(&mask),sizeof(mask));RegSetValueExW(access,L"ExpiresAt",0,REG_QWORD,reinterpret_cast<const BYTE*>(&expires),sizeof(expires));RegSetValueExW(access,L"InstallRoot",0,REG_SZ,reinterpret_cast<const BYTE*>(owner.c_str()),static_cast<DWORD>((owner.size()+1)*sizeof(wchar_t)));RegCloseKey(access);}
 ~IsolatedAccess(){if(enabled)RegOverridePredefKey(HKEY_CURRENT_USER,nullptr);if(key){RegCloseKey(key);RegDeleteTreeW(HKEY_CURRENT_USER,location.c_str());}}
};
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
    IsolatedAccess access(argv[1],argc==4);if(argc==4&&!access.enabled)return 43;
    if(access.enabled)access.set(7,access.now+3600,access.root);
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
    const CLSID objId = {0x3c9ee5a7,0x895c,0x46e2,{0x93,0x1b,0x13,0xa5,0x1e,0xa7,0xa8,0x42}};
    IExplorerCommand* clothing = nullptr;
    if (FAILED(getFactory(objId,IID_PPV_ARGS(&factory)))) return 32;
    HRESULT objCreated = argc == 5 ? CoCreateInstance(objId,nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&clothing)) : factory->CreateInstance(nullptr,IID_PPV_ARGS(&clothing));
    factory->Release();
    if (FAILED(objCreated)) return 33;
    if(access.enabled){
     const CLSID paidIds[]={objId,{0x86a7bf51,0x2c9e,0x4b80,{0x94,0xf2,0x89,0x20,0xfb,0x8f,0x42,0x99}},{0xb91e247d,0x60a8,0x4ce3,{0x99,0xb7,0xf3,0xd4,0x4d,0x1e,0xad,0x50}}};
     for(unsigned n=0;n<3;n++){
      IExplorerCommand* paid=nullptr;if(FAILED(getFactory(paidIds[n],IID_PPV_ARGS(&factory))))return 44;if(FAILED(factory->CreateInstance(nullptr,IID_PPV_ARGS(&paid))))return 45;factory->Release();
      IObjectWithSite* paidSite=nullptr;paid->QueryInterface(IID_PPV_ARGS(&paidSite));auto background=new BackgroundSite(argv[2]);paidSite->SetSite(static_cast<IServiceProvider*>(background));background->Release();
      IExplorerCommandState* classic=nullptr;if(FAILED(paid->QueryInterface(IID_PPV_ARGS(&classic))))return 46;EXPCMDSTATE state;
      access.set(0,access.now+3600,access.root);if(FAILED(classic->GetState(nullptr,TRUE,&state))||state!=ECS_HIDDEN||paid->Invoke(nullptr,nullptr)!=E_ACCESSDENIED)return 47;
      access.set(1<<n,access.now+3600,access.root);if(FAILED(classic->GetState(nullptr,TRUE,&state))||state!=ECS_ENABLED)return 48;
      access.set(7,access.now-1,access.root);if(FAILED(paid->GetState(nullptr,TRUE,&state))||state!=ECS_HIDDEN)return 49;
      access.set(7,access.now+73*3600,access.root);if(FAILED(paid->GetState(nullptr,TRUE,&state))||state!=ECS_HIDDEN)return 50;
      access.set(7,access.now+3600,access.root+L"-other");if(FAILED(paid->GetState(nullptr,TRUE,&state))||state!=ECS_HIDDEN)return 51;
      classic->Release();paidSite->SetSite(nullptr);paidSite->Release();paid->Release();
     }
     access.set(7,access.now+3600,access.root);
    }
    PWSTR objTitle = nullptr;
    if (FAILED(clothing->GetTitle(nullptr,&objTitle)) || wcscmp(objTitle,L"Exportar para OBJ com RPForge")) return 34;
    CoTaskMemFree(objTitle);
    EXPCMDSTATE objState;
    if (FAILED(clothing->GetState(nullptr,TRUE,&objState)) || objState != ECS_HIDDEN) return 35;
    for (const auto extension : { L".ydd", L".ytd" }) {
        auto selectedFile = std::wstring(argv[3]) + L"\\clothing-test" + extension;
        HANDLE file = CreateFileW(selectedFile.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
        if (file == INVALID_HANDLE_VALUE) return 36;
        CloseHandle(file);
        PIDLIST_ABSOLUTE pidl = nullptr;
        if (FAILED(SHParseDisplayName(selectedFile.c_str(),nullptr,&pidl,0,nullptr))) return 37;
        PCIDLIST_ABSOLUTE paths[] = {pidl};IShellItemArray* selection = nullptr;
        if (FAILED(SHCreateShellItemArrayFromIDLists(1,paths,&selection))) return 38;
        HRESULT selected = clothing->GetState(selection,TRUE,&objState);
        selection->Release();CoTaskMemFree(pidl);DeleteFileW(selectedFile.c_str());
        // Registered activation uses the real installation's access record, unlike
        // the in-process test's isolated Pro fixture. A signed-out audit must hide OBJ.
        const bool allowed = access.enabled || ForgeToolAccess(access.root,1);
        if (FAILED(selected) || objState != (!wcscmp(extension,L".ydd") && allowed ? ECS_ENABLED : ECS_HIDDEN)) {PWSTR actualIcon=nullptr;clothing->GetIcon(nullptr,&actualIcon);wprintf(L"Unexpected paid state %u for %s; icon=%s; HRESULT=%08lx\n",objState,extension,actualIcon?actualIcon:L"",static_cast<unsigned long>(selected));CoTaskMemFree(actualIcon);return 39;}
    }
    if (argc == 4) {
        IObjectWithSite* clothingSite = nullptr;
        if (FAILED(clothing->QueryInterface(IID_PPV_ARGS(&clothingSite)))) return 40;
        auto background = new BackgroundSite(argv[2]);
        clothingSite->SetSite(static_cast<IServiceProvider*>(background));background->Release();
        if (FAILED(clothing->GetState(nullptr,TRUE,&objState)) || objState != ECS_ENABLED) return 41;
        clothingSite->SetSite(nullptr);clothingSite->Release();
    }
    clothing->Release();
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
