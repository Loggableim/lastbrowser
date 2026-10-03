param(
    [Parameter(Mandatory = $true)]
    [string]$IpcDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $IpcDirectory)) {
    New-Item -ItemType Directory -Path $IpcDirectory -Force | Out-Null
}

$statePath = Join-Path $IpcDirectory 'state.json'
$requestPath = Join-Path $IpcDirectory 'request.json'
$script:counter = 0
$script:blocking = $false

function Write-State {
    param([bool]$Ready = $true)
    $state = @{
        ready = $Ready
        counter = $script:counter
        ownEdit = $script:edit.Text
        windowTitle = $script:form.Text
        uiBlocked = $script:blocking
        pid = $PID
    } | ConvertTo-Json -Compress
    $temporaryPath = "$statePath.tmp"
    [System.IO.File]::WriteAllText($temporaryPath, $state, [System.Text.Encoding]::UTF8)
    Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Lastbrowser UIA Test Fixture'
$script:form = $form
$form.Name = 'LastbrowserUiaTestForm'
$form.Size = New-Object System.Drawing.Size(440, 190)
$form.StartPosition = 'CenterScreen'
$form.ShowInTaskbar = $false
$form.TopMost = $true

$button = New-Object System.Windows.Forms.Button
$button.Name = 'InvokeCounterButton'
$button.Text = 'Invoke Counter'
$button.AccessibleName = 'Invoke Counter'
$button.Location = New-Object System.Drawing.Point(24, 24)
$button.Size = New-Object System.Drawing.Size(170, 42)
$button.Add_Click({
    $script:counter += 1
    Write-State
})
$form.Controls.Add($button)

$edit = New-Object System.Windows.Forms.TextBox
$edit.Name = 'OwnEditBox'
$edit.AccessibleName = 'Own Edit'
$edit.Location = New-Object System.Drawing.Point(24, 88)
$edit.Size = New-Object System.Drawing.Size(360, 28)
$edit.Text = 'initial-value'
$form.Controls.Add($edit)
$script:edit = $edit

$form.Add_Shown({
    # The test owns this window and deliberately establishes it as the
    # baseline target before asking UIA to invoke controls.
    $form.Activate()
    Write-State
})
$form.Add_FormClosed({ $timer.Stop() })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 100
$timer.Add_Tick({
    try {
        if (Test-Path -LiteralPath $requestPath) {
            $claimedPath = Join-Path $IpcDirectory 'request.processing'
            try {
                Move-Item -LiteralPath $requestPath -Destination $claimedPath -Force
                $request = Get-Content -LiteralPath $claimedPath -Raw | ConvertFrom-Json
                Remove-Item -LiteralPath $claimedPath -Force
                if ($request.action -eq 'block_ui') {
                    $script:blocking = $true
                    Write-State
                    Start-Sleep -Milliseconds ([Math]::Min(20000, [Math]::Max(1000, [int]$request.duration_ms)))
                    $script:blocking = $false
                }
            }
            catch {
                if (Test-Path -LiteralPath $claimedPath) {
                    Remove-Item -LiteralPath $claimedPath -Force -ErrorAction SilentlyContinue
                }
            }
        }
        Write-State
    }
    catch {
        # A transient state-file conflict must not terminate the UI message loop.
    }
})
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
