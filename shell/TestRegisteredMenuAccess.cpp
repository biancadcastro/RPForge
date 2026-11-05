#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <cstdio>
int wmain(int argc,wchar_t** argv){
 if(argc!=3)return 10;const unsigned mask=wcstoul(argv[2],nullptr,10);CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
 const CLSID ids[]={{0x3c9ee5a7,0x895c,0x46e2,{0x93,0x1b,0x13,0xa5,0x1e,0xa7,0xa8,0x42}},{0x86a7bf51,0x2c9e,0x4b80,{0x94,0xf2,0x89,0x20,0xfb,0x8f,0x42,0x99}},{0xb91e247d,0x60a8,0x4ce3,{0x99,0xb7,0xf3,0xd4,0x4d,0x1e,0xad,0x50}}};
 IShellItem* folder=nullptr;if(FAILED(SHCreateItemFromParsingName(argv[1],nullptr,IID_PPV_ARGS(&folder))))return 11;IShellItemArray* selection=nullptr;if(FAILED(SHCreateShellItemArrayFromShellItem(folder,IID_PPV_ARGS(&selection))))return 12;folder->Release();
 for(unsigned n=0;n<3;n++){IExplorerCommand* command=nullptr;if(FAILED(CoCreateInstance(ids[n],nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&command))))return 13;IExplorerCommandState* classic=nullptr;if(FAILED(command->QueryInterface(IID_PPV_ARGS(&classic))))return 14;
  EXPCMDSTATE state;const auto expected=(mask&(1<<n))?ECS_ENABLED:ECS_HIDDEN;
  if(FAILED(classic->GetState(selection,TRUE,&state))||state!=expected)return 15;
  if(FAILED(command->GetState(selection,TRUE,&state))||state!=expected)return 16;
  if(expected==ECS_HIDDEN&&command->Invoke(selection,nullptr)!=E_ACCESSDENIED)return 17;
  classic->Release();command->Release();
 }selection->Release();CoUninitialize();printf("PASS: registered classic and modern paid menus match mask %u; hidden commands cannot invoke.\n",mask);return 0;
}
