# Demo users without MFA

Demo accounts in a dev tenant should sign in with a password only, so a demo is not interrupted by an Authenticator prompt. Admins keep MFA. This guide replaces Security defaults with Conditional Access policies that exclude one group of demo users.

Use it only in a dev or demo tenant. Never in production.

Placeholders: `<tenant>` is the tenant name (`<tenant>.onmicrosoft.com`). Never commit real values.

## Prerequisites

- Microsoft Entra ID P1 or P2 (**Entra ID → Overview → License**). The Microsoft 365 E5 developer tenant has P2. Without P1 there is no Conditional Access; see [Without P1](#without-p1).
- A Global Administrator account.
- Microsoft Graph PowerShell, only for the break-glass steps:

  ```powershell
  Install-Module Microsoft.Graph.Authentication, Microsoft.Graph.Users, Microsoft.Graph.Identity.Governance, Microsoft.Graph.Identity.SignIns -Scope CurrentUser -Repository PSGallery
  ```

## 1. Find what requires MFA

Sign in as a demo user, then open **Monitoring → Sign-in logs**, select the sign-in and read the **Authentication Details** and **Conditional Access** tabs. The usual sources:

| Source | Where |
|---|---|
| Security defaults | Entra ID → Overview → Properties → Manage security defaults |
| Conditional Access | Entra ID → Conditional Access → Policies |
| Per-user MFA (legacy) | Entra ID → Users → All users → Per-user MFA |

Security defaults cannot exclude single users, so they have to be replaced. If the **Manage security defaults** page returns a 404, open it from entra.microsoft.com rather than portal.azure.com, or check with Graph:

```powershell
Connect-MgGraph -Scopes "Policy.Read.All" -UseDeviceCode
Get-MgPolicyIdentitySecurityDefaultEnforcementPolicy | Select-Object IsEnabled
```

## 2. Demo users group

**Groups → New group**: type Security, name `Demo users - MFA excluded`, membership Assigned. Add the demo accounts. To add a demo user later, add them to this group; the policies need no change.

## 3. Break-glass account

Create the emergency access account before you touch the policies, so a wrong policy cannot lock you out. Do not use your daily admin account for this.

```powershell
Connect-MgGraph -Scopes "User.ReadWrite.All","RoleManagement.ReadWrite.Directory" -UseDeviceCode

$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$pwd = [Convert]::ToBase64String($bytes)

$bg = New-MgUser -DisplayName "Break Glass 01" `
  -UserPrincipalName "breakglass01@<tenant>.onmicrosoft.com" `
  -MailNickname "breakglass01" `
  -AccountEnabled `
  -PasswordPolicies "DisablePasswordExpiration" `
  -PasswordProfile @{ Password = $pwd; ForceChangePasswordNextSignIn = $false }

$ga = Get-MgRoleManagementDirectoryRoleDefinition -Filter "displayName eq 'Global Administrator'"
New-MgRoleManagementDirectoryRoleAssignment -PrincipalId $bg.Id -RoleDefinitionId $ga.Id -DirectoryScopeId "/"

"Password: $pwd"
```

Store the password in a password manager and clear the console.

- Cloud-only, on the `onmicrosoft.com` domain, not tied to a person.
- Global Administrator as an **active permanent** assignment. With PIM, check that it is not only *Eligible*.
- Register a phishing-resistant method: enable **Authentication methods → Policies → Passkey (FIDO2)**, sign in as the account and add a security key or passkey at mysignins.microsoft.com/security-info. Microsoft's mandatory MFA for the Entra, Azure and Microsoft 365 admin portals applies to break-glass accounts too, and Conditional Access exclusions do not change that.
- Review its sign-ins in **Sign-in logs** now and then. With an Azure subscription, send `SignInLogs` to Log Analytics and alert on any sign-in by this account.

`Connect-MgGraph` signs in through Web Account Manager on Windows, and in the VS Code terminal its window can open behind the editor. Use `-UseDeviceCode`, or run `Set-MgGraphOption -EnableLoginByWAM $false` to sign in through the browser.

## 4. Conditional Access policies

While Security defaults are on, policies can only be saved as **Report-only**. Create all three that way under **Conditional Access → Policies → New policy**. Exclude the break-glass account from each.

| Policy | Users | Target resources | Grant |
|---|---|---|---|
| `CA01 - Require MFA for admins` | Include directory roles: Global Administrator, Privileged Role Administrator, SharePoint Administrator, User Administrator, Security Administrator, Exchange Administrator, Conditional Access Administrator | All resources | Require multifactor authentication |
| `CA02 - Require MFA for all users except demo` | Include all users; exclude `Demo users - MFA excluded` | All resources | Require multifactor authentication |
| `CA03 - Block legacy authentication` | Include all users | All resources; Conditions → Client apps: Exchange ActiveSync clients, Other clients | Block access |

Together they give the same protection as Security defaults, minus MFA for the demo group.

## 5. Switch over

Do both steps right after each other; between them the tenant has no MFA.

1. **Manage security defaults** → Disabled → reason *My organization is planning to use Conditional Access* → Save.
2. Open CA01, CA02 and CA03 and set **Enable policy** to **On**.

## 6. Check

Use a separate private window for each account.

| Account | Expected |
|---|---|
| Demo user | Signs in to SharePoint without MFA |
| Daily admin | Asked for MFA |
| Break-glass | Signs in with the security key |

In **Sign-in logs**, the demo user's sign-in shows *Single-factor authentication*, and CA01 and CA02 show *Not applied*. If a sign-in still asks for MFA, use **Users → (user) → Revoke sessions** and try again.

If a demo user gets **More information required**, the prompt comes from method registration, not from MFA:

- **Authentication methods → Registration campaign**: exclude the demo group.
- **Password reset → Properties**: if it is *All*, change it to *Selected* without the demo group.

## Keeping it safe

- Demo users get no admin roles. The admin portals require MFA for everyone anyway.
- Change demo passwords after a demo shown to outside people.
- If Microsoft adds a managed Conditional Access policy that requires MFA, exclude the demo group from it too.
- Optional with P2: block high user risk (Conditions → User risk: High → Block access), and block the demo group outside a named location if demos always run from one network.

## Without P1

There is no Conditional Access. Disable Security defaults, then under **Users → Per-user MFA** enable MFA for the admin accounts only. Demo users stay without MFA.
