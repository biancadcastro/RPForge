#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <shlobj.h>
inline bool ForgeAccessRecord(const std::wstring& root,DWORD required,DWORD mask,ULONGLONG expires,const wchar_t* owner){
 if((mask&required)!=required||_wcsicmp(root.c_str(),owner))return false;
 FILETIME time;GetSystemTimeAsFileTime(&time);ULARGE_INTEGER ticks;ticks.LowPart=time.dwLowDateTime;ticks.HighPart=time.dwHighDateTime;const auto now=ticks.QuadPart/10000000ULL-11644473600ULL;
 return expires>now&&expires<=now+72*60*60;
}
inline bool ForgeAccessFile(const std::wstring& root,DWORD required,bool* authoritative=nullptr){
 if(authoritative)*authoritative=false;
 PWSTR local=nullptr;if(FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData,KF_FLAG_NO_APPCONTAINER_REDIRECTION,nullptr,&local)))return false;const std::wstring path=std::wstring(local)+L"\\RPForge\\menu-access.bin";CoTaskMemFree(local);
 HANDLE file=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);if(file==INVALID_HANDLE_VALUE)return false;
 if(authoritative)*authoritative=true;
 const DWORD size=GetFileSize(file,nullptr);if(size<18||size>65536||size%2){CloseHandle(file);return false;}std::vector<BYTE> bytes(size);DWORD read=0;const bool ok=ReadFile(file,bytes.data(),size,&read,nullptr)&&read==size;CloseHandle(file);if(!ok||*reinterpret_cast<DWORD*>(bytes.data())!=1||*reinterpret_cast<wchar_t*>(bytes.data()+size-2)!=0)return false;
 const auto owner=reinterpret_cast<wchar_t*>(bytes.data()+16);
 if(_wcsicmp(root.c_str(),owner)){if(authoritative)*authoritative=false;return false;}
 return ForgeAccessRecord(root,required,*reinterpret_cast<DWORD*>(bytes.data()+4),*reinterpret_cast<ULONGLONG*>(bytes.data()+8),owner);
}
inline bool ForgeToolAccess(const std::wstring& root,DWORD required) {
 // Packaged Explorer COM can see a stale virtualized registry. Prefer the atomic cache for this installation.
 bool authoritative=false;const bool cached=ForgeAccessFile(root,required,&authoritative);if(authoritative)return cached;
 DWORD mask=0,bytes=sizeof(mask);ULONGLONG expires=0;
 if(RegGetValueW(HKEY_CURRENT_USER,L"Software\\RPForge\\ToolAccess",L"Mask",RRF_RT_REG_DWORD,nullptr,&mask,&bytes)!=ERROR_SUCCESS)return ForgeAccessFile(root,required);
 if((mask&required)!=required)return false;
 bytes=sizeof(expires);if(RegGetValueW(HKEY_CURRENT_USER,L"Software\\RPForge\\ToolAccess",L"ExpiresAt",RRF_RT_REG_QWORD,nullptr,&expires,&bytes)!=ERROR_SUCCESS)return ForgeAccessFile(root,required);
 wchar_t owner[32768];bytes=sizeof(owner);if(RegGetValueW(HKEY_CURRENT_USER,L"Software\\RPForge\\ToolAccess",L"InstallRoot",RRF_RT_REG_SZ,nullptr,owner,&bytes)!=ERROR_SUCCESS)return ForgeAccessFile(root,required);
 return ForgeAccessRecord(root,required,mask,expires,owner);
}
