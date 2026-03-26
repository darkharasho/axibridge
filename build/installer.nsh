!macro customInit
  ; Check if old ArcBridge (com.arcbridge.app) is installed and uninstall it silently
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arcbridge.app" "UninstallString"
  ${If} $0 != ""
    ; Extract the directory from the uninstall string (it may be quoted)
    ${If} ${FileExists} $0
      ExecWait '"$0" /S --keep-data'
    ${Else}
      ; Try removing quotes
      StrCpy $1 $0 "" 1
      StrLen $2 $1
      IntOp $2 $2 - 1
      StrCpy $1 $1 $2
      ${If} ${FileExists} $1
        ExecWait '"$1" /S --keep-data'
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
