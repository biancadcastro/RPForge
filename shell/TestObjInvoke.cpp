#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <cstdio>

// Explicit integration check: invokes the actually registered Explorer command.
// It opens the compact review window; it never starts an export automatically.
int wmain(int argc, wchar_t** argv) {
    if (argc != 2 && argc != 3) return 10;
    // Test helpers must never open a production/corpus asset for an interactive
    // conversion. The Explorer extension itself is not subject to this guard.
    wchar_t isolatedRoot[32768],temporaryRoot[32768],selected[32768];
    DWORD isolatedLength=GetEnvironmentVariableW(L"RPF_TEST_INPUT_ROOT",isolatedRoot,32768);
    DWORD temporaryLength=GetTempPathW(32768,temporaryRoot);
    if(!isolatedLength||isolatedLength>=32768||!temporaryLength||temporaryLength>=32768){puts("Use copied temporary inputs and RPF_TEST_INPUT_ROOT for this test helper.");return 16;}
    if(_wcsnicmp(isolatedRoot,temporaryRoot,temporaryLength)){puts("The test input root must be temporary.");return 16;}
    DWORD selectedLength=GetFullPathNameW(argv[argc-1],32768,selected,nullptr);
    if(!selectedLength||selectedLength>=32768||_wcsnicmp(selected,isolatedRoot,isolatedLength)||(selected[isolatedLength]!=L'\\'&&selected[isolatedLength]!=0)){puts("Only copied test inputs are allowed.");return 16;}
    const bool neon = argc == 3 && !wcscmp(argv[1],L"--neon");
    const bool skin = argc == 3 && !wcscmp(argv[1],L"--skin");
    if (argc == 3 && !neon && !skin) return 10;
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    const CLSID objId = {0x3c9ee5a7,0x895c,0x46e2,{0x93,0x1b,0x13,0xa5,0x1e,0xa7,0xa8,0x42}};
    const CLSID neonId = {0x86a7bf51,0x2c9e,0x4b80,{0x94,0xf2,0x89,0x20,0xfb,0x8f,0x42,0x99}};
    const CLSID skinId = {0xb91e247d,0x60a8,0x4ce3,{0x99,0xb7,0xf3,0xd4,0x4d,0x1e,0xad,0x50}};
    const CLSID id = skin ? skinId : neon ? neonId : objId;
    IExplorerCommand* command = nullptr;
    HRESULT hr = CoCreateInstance(id,nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&command));
    if (FAILED(hr)) { printf("COM activation failed: %08lx\n",static_cast<unsigned long>(hr));return 11; }
    IShellItem* item = nullptr;
    hr = SHCreateItemFromParsingName(argv[argc-1],nullptr,IID_PPV_ARGS(&item));
    if (FAILED(hr)) { printf("Shell item creation failed: %08lx\n",static_cast<unsigned long>(hr));return 12; }
    IShellItemArray* items = nullptr;
    hr = SHCreateShellItemArrayFromShellItem(item,IID_PPV_ARGS(&items));item->Release();
    if (FAILED(hr)) return 13;
    EXPCMDSTATE state;
    hr=command->GetState(items,TRUE,&state);
    if (FAILED(hr)||state!=ECS_ENABLED) return 14;
    hr=command->Invoke(items,nullptr);
    items->Release();command->Release();CoUninitialize();
    if (FAILED(hr)) {printf("Invoke failed: %08lx\n",static_cast<unsigned long>(hr));return 15;}
    puts(skin ? "PASS: registered Explorer skin separation command invoked." : neon ? "PASS: registered Explorer Neon command invoked." : "PASS: registered Explorer OBJ command invoked.");return 0;
}
