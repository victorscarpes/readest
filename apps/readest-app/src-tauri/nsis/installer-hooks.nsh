; Readest NSIS Installer Hooks
; Registers/unregisters the thumbnail provider DLL for Windows Explorer thumbnails

!include "LogicLib.nsh"

; CLSID for Readest Thumbnail Provider
!define CLSID_READEST_THUMBNAIL "{D2C86420-833F-4E4E-B727-6DDC1079BC00}"

; IThumbnailProvider Shell Extension Handler GUID  
!define SHELL_THUMBNAIL_HANDLER "{e357fccd-a995-4576-b01f-234630154e96}"

;------------------------------------------------------------------------------
; NSIS_HOOK_POSTINSTALL - Called after files are installed
;------------------------------------------------------------------------------
!macro NSIS_HOOK_POSTINSTALL
    DetailPrint "Registering Readest Thumbnail Provider..."
    
    ; Always do manual registration for reliability
    ; regsvr32 may fail silently if DLL can't find dependencies
    
    ; Register CLSID with full DLL path
    WriteRegStr HKCR "CLSID\${CLSID_READEST_THUMBNAIL}" "" "Readest Thumbnail Provider"
    WriteRegStr HKCR "CLSID\${CLSID_READEST_THUMBNAIL}\InprocServer32" "" "$INSTDIR\readest_thumbnail.dll"
    WriteRegStr HKCR "CLSID\${CLSID_READEST_THUMBNAIL}\InprocServer32" "ThreadingModel" "Apartment"
    
    ; CRITICAL: Disable process isolation - required because we use IInitializeWithItem, not IInitializeWithStream
    ; Without this, Windows runs the handler in an isolated process that can't load the DLL properly
    WriteRegDWORD HKCR "CLSID\${CLSID_READEST_THUMBNAIL}" "DisableProcessIsolation" 1
    
    ; ========== EPUB ==========
    ; Register thumbnail handler directly on extension (this is what Windows Shell uses)
    WriteRegStr HKCR ".epub\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    ; ========== MOBI ==========
    WriteRegStr HKCR ".mobi\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    ; ========== AZW ==========
    WriteRegStr HKCR ".azw\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    ; ========== AZW3 ==========
    WriteRegStr HKCR ".azw3\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    ; ========== KF8 ==========
    WriteRegStr HKCR ".kf8\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    ; ========== FB2 ==========
    WriteRegStr HKCR ".fb2\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    ; ========== CBZ ==========
    WriteRegStr HKCR ".cbz\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    ; ========== CBR ==========
    WriteRegStr HKCR ".cbr\ShellEx\${SHELL_THUMBNAIL_HANDLER}" "" "${CLSID_READEST_THUMBNAIL}"
    
    DetailPrint "Thumbnail provider registered successfully."

    ; Refresh shell to apply changes - SHCNE_ASSOCCHANGED
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

;------------------------------------------------------------------------------
; NSIS_HOOK_PREUNINSTALL - Called before files are removed
;------------------------------------------------------------------------------
!macro NSIS_HOOK_PREUNINSTALL
    DetailPrint "Unregistering Readest Thumbnail Provider..."
    
    ; Remove CLSID
    DeleteRegKey HKCR "CLSID\${CLSID_READEST_THUMBNAIL}"
    
    ; Remove ShellEx from extensions
    ReadRegStr $R9 HKCR ".epub\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".epub\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    ReadRegStr $R9 HKCR ".mobi\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".mobi\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    ReadRegStr $R9 HKCR ".azw\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".azw\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    ReadRegStr $R9 HKCR ".azw3\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".azw3\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    ReadRegStr $R9 HKCR ".kf8\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".kf8\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    ReadRegStr $R9 HKCR ".fb2\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".fb2\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    ReadRegStr $R9 HKCR ".cbz\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".cbz\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    ReadRegStr $R9 HKCR ".cbr\ShellEx\${SHELL_THUMBNAIL_HANDLER}" ""
    ${If} $R9 == "${CLSID_READEST_THUMBNAIL}"
        DeleteRegKey HKCR ".cbr\ShellEx\${SHELL_THUMBNAIL_HANDLER}"
    ${EndIf}
    
    ; Delete the DLL file
    Delete "$INSTDIR\readest_thumbnail.dll"
    
    ; Refresh shell
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
