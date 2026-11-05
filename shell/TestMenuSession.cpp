#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <cstdio>
int wmain(int argc,wchar_t** argv){
 if(argc<2||argc>3)return 10;CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
 const CLSID id={0x3c9ee5a7,0x895c,0x46e2,{0x93,0x1b,0x13,0xa5,0x1e,0xa7,0xa8,0x42}};
 IShellItem* folder=nullptr;IShellItemArray* items=nullptr;IExplorerCommand* command=nullptr;
 HRESULT hr=SHCreateItemFromParsingName(argv[1],nullptr,IID_PPV_ARGS(&folder));if(FAILED(hr))return 11;
 hr=SHCreateShellItemArrayFromShellItem(folder,IID_PPV_ARGS(&items));folder->Release();if(FAILED(hr))return 12;
 hr=CoCreateInstance(id,nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&command));if(FAILED(hr))return 13;
 EXPCMDSTATE state;hr=command->GetState(items,TRUE,&state);if(FAILED(hr)||state!=ECS_ENABLED)return 14;
 hr=command->Invoke(items,nullptr);printf("Registered Explorer invocation HRESULT: %08lx\n",(unsigned long)hr);fflush(stdout);if(argc==3)getchar();command->Release();items->Release();CoUninitialize();return FAILED(hr)?15:0;
}
