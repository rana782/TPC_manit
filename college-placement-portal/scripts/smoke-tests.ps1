# smoke-tests.ps1 — Windows-compatible smoke tests (Module 01)
# Mirrors smoke-tests.sh for PowerShell environments.
# Requires backend to be running: npm run dev (port 5000)

param(
    [string]$BaseUrl = "http://localhost:5000"
)

$ErrorActionPreference = "Stop"
$failed = $false

function Test-Endpoint {
    param([string]$label, [string]$url, [string]$method = "GET", [string]$body = $null, [int]$expectedStatus = 200)
    try {
        $params = @{ Uri = $url; Method = $method; TimeoutSec = 5; UseBasicParsing = $true }
        if ($body) {
            $params.Body = $body
            $params.ContentType = "application/json"
        }
        $resp = Invoke-WebRequest @params
        if ($resp.StatusCode -eq $expectedStatus) {
            Write-Host "  ✅ PASS  [$method $url] → $($resp.StatusCode)"
        } else {
            Write-Host "  ❌ FAIL  [$method $url] → got $($resp.StatusCode), expected $expectedStatus"
            $script:failed = $true
        }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -and $code -eq $expectedStatus) {
            Write-Host "  ✅ PASS  [$method $url] → $code (expected error)"
        } else {
            Write-Host "  ❌ FAIL  [$method $url] → $($_.Exception.Message)"
            $script:failed = $true
        }
    }
}

Write-Host "`n=== Running Smoke Tests against $BaseUrl ===`n"

Write-Host "1. Backend Health Check"
Test-Endpoint "Health" "$BaseUrl/api/health"

Write-Host "`n2. Auth: Login endpoint reachable (400 on bad creds is fine)"
Test-Endpoint "Auth Login bad creds" "$BaseUrl/api/auth/login" "POST" '{"email":"no@no.com","password":"bad"}' 400

Write-Host "`n3. Protected route without token returns 401"
Test-Endpoint "Protected /api/admin/stats no token" "$BaseUrl/api/admin/stats" "GET" $null 401

Write-Host "`n4. Student profile without token returns 401"
Test-Endpoint "Student profile no token" "$BaseUrl/api/student/profile" "GET" $null 401

Write-Host "`n5. Jobs listing reachable"
Test-Endpoint "Jobs list" "$BaseUrl/api/jobs"

if ($failed) {
    Write-Host "`n❌ Some smoke tests FAILED.`n"
    exit 1
} else {
    Write-Host "`n✅ All smoke tests PASSED.`n"
    exit 0
}
