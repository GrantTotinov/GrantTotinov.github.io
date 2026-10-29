---
title: "ES256 doesn't mean P-256 (unless you check): fixing passkey key validation in ASP.NET Core"
description: "A passkey public key carries an algorithm and a curve, and WebAuthn says they have to agree. ASP.NET Core Identity didn't check that. Notes on PR #68834: where the gap comes from, what a mismatched key actually does in .NET, and the fix."
pubDatetime: 2026-10-21T01:00:00Z
repo: aspnetcore
pr: 68834
tags:
  - aspnetcore
  - passkeys
  - webauthn
  - security
---

Passkeys look like the simple part of authentication. The authenticator makes a key pair, the browser hands the public half to your server, and from then on the server checks signatures. I didn't think much about the "hands the public half to your server" step until I picked up [dotnet/aspnetcore#68755](https://github.com/dotnet/aspnetcore/issues/68755), a three-line issue asking for one more check on that public key.

The fix became [#68834](https://github.com/dotnet/aspnetcore/pull/68834). It was merged on 29 September 2026 and sits on the `12.0-preview1` milestone. This post is about what the check is, why the spec needs it, what a key that fails it would actually have done in .NET, and two decisions from code review that I would have gotten wrong on my own.

## Table of contents

## Three fields that have to agree

A WebAuthn credential public key is a COSE_Key: a small CBOR map with integer labels instead of JSON field names. For an elliptic curve key, three entries matter here:

| Label | Field             | Values that come up in this post                   |
| ----- | ----------------- | -------------------------------------------------- |
| 1     | `kty` (key type)  | 2 = EC2, 1 = OKP, 3 = RSA                          |
| -1    | `crv` (curve)     | 1 = P-256, 2 = P-384, 3 = P-521, 8 = secp256k1     |
| 3     | `alg` (algorithm) | -7 = ES256, -35 = ES384, -36 = ES512, -47 = ES256K |

A normal passkey from a phone or a laptop says EC2, P-256, ES256. The issue was about what happens when those three don't line up.

## Where the gap comes from

If you've worked with JWTs, you know ES256 from JOSE, where it means "ECDSA using P-256 and SHA-256". The curve is part of the name. COSE kept the name but not the meaning. [RFC 9053](https://www.rfc-editor.org/rfc/rfc9053.html#section-2.1) defines ES256 as "ECDSA w/ SHA-256" and leaves the curve to the key's own `crv` parameter. On how the two should be paired, it only goes as far as a recommendation:

> In order to promote interoperability, it is suggested that SHA-256 be used only with curve P-256, SHA-384 be used only with curve P-384, and SHA-512 be used only with curve P-521.

"Suggested" is not a requirement. WebAuthn Level 3 turns it into one, in [§5.8.5](https://www.w3.org/TR/webauthn-3/#sctn-alg-identifier):

> Keys with algorithm -7 (ES256) MUST specify 1 (P-256) as the crv parameter and MUST NOT use the compressed point form.

The same rule follows for ES384 with P-384, ES512 with P-521 and EdDSA with Ed25519. [RFC 8812](https://www.rfc-editor.org/rfc/rfc8812.html#section-3.3) closes the remaining case from the other side: secp256k1 "MUST be used only with the ES256K algorithm identifier and not any others, including not with the COSE ES256 identifier."

So a relying party that follows WebAuthn should reject a key that says `kty: EC2, crv: P-384, alg: ES256`. Before #68834, ASP.NET Core Identity accepted it.

## What the old code checked

This is the curve handling in `src/Identity/Core/src/Passkeys/CredentialPublicKey.cs` before the change:

```csharp
private static ECDsa ParseECDsa(COSEKeyType kty, Ctap2CborReader reader)
{
    var ecParams = new ECParameters();

    reader.ReadCoseKeyLabel((int)COSEKeyParameter.Crv);
    var crv = (COSEEllipticCurve)reader.ReadInt32();

    if (IsValidKtyCrvCombination(kty, crv))
    {
        ecParams.Curve = MapCoseCrvToECCurve(crv);
    }
    // ... read x and y, build the ECDsa
}
```

Two things stand out once you look for them. First, `alg` is never passed in, so this method can't compare it with anything. Second, the existing `kty`/`crv` check doesn't throw. If the pair is invalid, the curve is simply left unset, and the key gets rejected later, when .NET tries to build an `ECDsa` from parameters that have no curve. During review this was confirmed directly: with the check removed, a bad key fails with `PlatformNotSupportedException` instead of a validation error. Right outcome, wrong reason.

## Does a mismatched key actually work?

I wanted to be sure about this before calling it a bug, because "the spec says MUST" and "this matters" are two different claims.

Here is how the decoded key verifies an assertion signature:

```csharp
COSEKeyType.EC2 => _ecdsa!.VerifyData(data, signature, HashAlgFromCOSEAlg(_alg), DSASignatureFormat.Rfc3279DerSequence),
```

The hash comes from `alg`. The curve comes from `crv`. Nothing ties them together, and ECDSA itself doesn't care: a hash longer than the curve's group order gets truncated to its leftmost bits, and a shorter one is used as it is ([FIPS 186-5, §6.4](https://csrc.nist.gov/pubs/fips/186-5/final)). To check that .NET behaves the same way, I ran this on .NET 10:

```csharp
using System.Security.Cryptography;

var data = new byte[] { 1, 2, 3 };
foreach (var (name, curve, hash) in new[] {
    ("ES512 label on P-256", ECCurve.NamedCurves.nistP256, HashAlgorithmName.SHA512),
    ("ES256 label on P-384", ECCurve.NamedCurves.nistP384, HashAlgorithmName.SHA256) })
{
    using var k = ECDsa.Create(curve);
    var sig = k.SignData(data, hash, DSASignatureFormat.Rfc3279DerSequence);
    Console.WriteLine($"{name}: verifies = {k.VerifyData(data, sig, hash, DSASignatureFormat.Rfc3279DerSequence)}");
}
```

```text
ES512 label on P-256: verifies = True
ES256 label on P-384: verifies = True
```

So before the fix, a credential that said ES512 but actually lived on P-256 would register, sign in without problems and keep reporting itself as ES512.

How bad is that? A rough way to estimate it: the security level of an ECDSA signature is about the smaller of two numbers, half the bit length of the curve's group order and half the output length of the hash (its collision resistance).

| `alg` says | `crv` is        | Hash (bits / 2) | Curve (bits / 2) | Effective, roughly |
| ---------- | --------------- | --------------- | ---------------- | ------------------ |
| ES256      | P-256 (correct) | 128             | 128              | 128                |
| ES256      | P-384           | 128             | 192              | 128                |
| ES384      | P-256           | 192             | 128              | 128                |
| ES512      | P-256           | 256             | 128              | 128                |
| ES512      | P-384           | 256             | 192              | 192                |

No row drops below the 128 bits a correct ES256 key gives you. I don't think this is exploitable on its own, and I'd rather not oversell it. What breaks is the key's description of itself. The recorded algorithm no longer tells you how strong the key is, so anything that later reasons about stored credentials by algorithm (a policy that wants ES384 or better, an audit of which users are on which algorithms) gets the wrong answer. And it is a plainly stated input-validation rule in authentication code. That is the kind of rule you want enforced when the key is decoded, not left to whatever happens to fail further down.

## The fix

After the change, `ParseECDsa` receives the algorithm and runs its checks in a fixed order:

```csharp
private static ECDsa ParseECDsa(COSEKeyType kty, COSEAlgorithmIdentifier alg, Ctap2CborReader reader)
{
    var ecParams = new ECParameters();

    reader.ReadCoseKeyLabel((int)COSEKeyParameter.Crv);
    var crv = (COSEEllipticCurve)reader.ReadInt32();

    if (crv == COSEEllipticCurve.P256K)
    {
        // P256K (secp256k1) is a valid COSE curve, but this implementation
        // has never supported it. Distinguish "recognized but unsupported"
        // from "not a valid kty+crv combination" below.
        throw new NotSupportedException("The COSE curve 'P256K' is not supported.");
    }

    if (!IsValidKtyCrvCombination(kty, crv))
    {
        throw new CborContentException($"The COSE key type '{kty}' is not valid for crv '{crv}'.");
    }

    var curve = MapCoseCrvToECCurve(crv);

    if (kty == COSEKeyType.EC2 && !IsValidAlgCrvCombination(alg, crv))
    {
        throw new CborContentException($"The COSE algorithm '{alg}' is not valid for kty '{kty}' and crv '{crv}'.");
    }

    ecParams.Curve = curve;
    // ... read x and y as before
}
```

The pairing table itself is a small switch:

```csharp
// See https://www.w3.org/TR/webauthn-3/#sctn-alg-identifier for the
// alg/crv pairings for the currently supported EC2 algorithms.
// Adding another EC2 algorithm to IsSupportedAlgorithm also requires
// updating this switch. ES256K is intentionally omitted: it isn't in
// IsSupportedAlgorithm, and a P256K crv is already rejected above
// with NotSupportedException before this runs.
static bool IsValidAlgCrvCombination(COSEAlgorithmIdentifier alg, COSEEllipticCurve crv)
{
    return (alg, crv) switch
    {
        (COSEAlgorithmIdentifier.ES256, COSEEllipticCurve.P256) => true,
        (COSEAlgorithmIdentifier.ES384, COSEEllipticCurve.P384) => true,
        (COSEAlgorithmIdentifier.ES512, COSEEllipticCurve.P521) => true,
        _ => false,
    };
}
```

In order, a key can now fail because:

1. its curve is real but not implemented (secp256k1), which gives `NotSupportedException`;
2. its key type and curve don't belong together, which gives `CborContentException`;
3. its curve is an OKP curve that `MapCoseCrvToECCurve` doesn't support, which gives `NotSupportedException` (this part was already there);
4. it's an EC2 key whose algorithm doesn't match its curve, which gives `CborContentException`.

`Decode()` wraps all of them in a `PasskeyException`, so callers see exactly the same exception type as before. The inner exception tells you which rule failed.

## What changed in review

The PR went up on 27 August and was merged about a month later. Most of that time was waiting, which is normal for a repository this size. The review itself changed three things.

**Gate the check to EC2 explicitly.** The first review was automated, from Copilot's pull request reviewer. My first version ran the `alg`/`crv` check on any key that reached that line and relied on `MapCoseCrvToECCurve` throwing for OKP curves first. The comment called that "a fragile coupling": if that path ever gains OKP support, Ed25519 keys would start failing a check that was never written for them. It was right. The fix was the `kty == COSEKeyType.EC2 &&` condition and putting `kty` into the error message, pushed the same night.

**"Invalid" is not the same as "not supported".** My first version left ES256K out of the switch, because it isn't in `IsSupportedAlgorithm` and the existing `kty`/`crv` check already rejected the P256K curve. The result was that a secp256k1 key got rejected as malformed. [Brennan Conroy](https://github.com/BrennanConroy), who opened the issue, asked:

> I wonder if we should be throwing NotSupportedException for this case, since it is valid we just don't support it right now or ever?

This is the part of the PR I learned the most from. ES256K with secp256k1 is a legitimate pairing, registered by RFC 8812. The key isn't broken; ASP.NET Core just doesn't implement it. `NotSupportedException` says exactly that, while `CborContentException` says the client sent garbage. It also matches the convention `MapCoseCrvToECCurve` already followed for OKP curves. I pushed the change as a separate commit so it would be easy to drop if the team preferred something else.

**Write the comment for the next person.** Brennan also asked for the comment to say "pairings for the currently supported EC2 algorithms" and to point out that adding an algorithm to `IsSupportedAlgorithm` means updating this switch too. Two lists that have to stay in sync are exactly where the next bug of this kind would come from, so the comment is aimed at whoever adds the next EC2 algorithm.

## Tests

There was no `CredentialPublicKeyTest.cs` before this PR, so I added one. The tests went in as their own commit before the fix, so a reviewer could read what behaviour I was claiming before reading how I implemented it.

The hard part was producing keys that are broken on purpose. .NET's `ECDsa` only gives you valid key material, but the CBOR around it can say anything. So the helper generates a real key on a real curve and then writes whatever labels the test asks for:

```csharp
private static byte[] EncodeEcPublicKeyCbor(int algId, int crv, int? keyMaterialCrv = null, int kty = 2)
{
    using var ecdsa = ECDsa.Create(MapCrvToECCurve(keyMaterialCrv ?? crv));
    var parameters = ecdsa.ExportParameters(includePrivateParameters: false);

    var writer = new CborWriter(CborConformanceMode.Ctap2Canonical);
    writer.WriteStartMap(5); // kty, alg, crv, x, y
    writer.WriteInt32(1);  writer.WriteInt32(kty);
    writer.WriteInt32(3);  writer.WriteInt32(algId);
    writer.WriteInt32(-1); writer.WriteInt32(crv);
    writer.WriteInt32(-2); writer.WriteByteString(parameters.Q.X!);
    writer.WriteInt32(-3); writer.WriteByteString(parameters.Q.Y!);
    writer.WriteEndMap();
    return writer.Encode();
}
```

(In the PR the labels are named constants. I inlined them here to keep the snippet short.)

The same helper feeds both the valid cases and the mismatched ones, so both go through the identical decode path and only the labels differ:

```csharp
[Theory]
[InlineData(AlgES256, CrvP384)]
[InlineData(AlgES256, CrvP521)]
[InlineData(AlgES384, CrvP256)]
[InlineData(AlgES384, CrvP521)]
[InlineData(AlgES512, CrvP256)]
[InlineData(AlgES512, CrvP384)]
public void Decode_Throws_WhenAlgAndCrvAreMismatched(int algId, int crv)
{
    var bytes = EncodeEcPublicKeyCbor(algId, crv);

    var exception = Assert.Throws<PasskeyException>(() => CredentialPublicKey.Decode(bytes));

    Assert.IsType<CborContentException>(exception.InnerException);
    Assert.Contains("algorithm", exception.InnerException!.Message, StringComparison.OrdinalIgnoreCase);
}
```

The secp256k1 test needed one more trick. `ECCurve.NamedCurves` has no secp256k1, so the test can't create real key material for it. That is what `keyMaterialCrv` is for: the test writes P-256 coordinates under the secp256k1 label. The decoder rejects the label before it ever looks at the point, which is exactly the behaviour under test.

Review also pointed out that the `kty`/`crv` rejection path had never had a test. `Decode_Throws_WhenCrvIsNotValidForKty` now covers it by encoding `kty = OKP` with the P-384 curve. That makes 11 cases in total: 3 valid pairs, 6 mismatched pairs, the ES256K case and the `kty`/`crv` case.

## If you maintain a WebAuthn relying party

This is the list I'd check against any implementation now, in any language:

- **`kty` against `crv`.** An EC2 key can't sit on an OKP curve, and the other way round.
- **`alg` against `crv`.** For EC2 keys, use the table in WebAuthn §5.8.5, and remember EdDSA must use Ed25519.
- **`alg` against what you implement.** Keep "we don't support this" separate from "this is malformed". Logs and error messages read very differently.
- **The point is on the curve.** WebAuthn §5.8.5 adds a note that this check "is judged to be at particular risk of falling through the gap between a cryptographic library and other code". Know which layer of your stack does it.
- **The fully-specified identifiers.** RFC 9864 adds ESP256 (-9), ESP384 (-51) and ESP512 (-52), where the curve is part of the algorithm again, the way it is in JOSE. WebAuthn Level 3 already lists them. Each new identifier is one more row in the table you have to keep consistent.

I've started looking at how other WebAuthn libraries handle these same combinations. I'll write that up once there is something solid to report.

## References

1. dotnet/aspnetcore issue [#68755](https://github.com/dotnet/aspnetcore/issues/68755): Validate Passkey Algorithm + CRV when decoding CredentialPublicKey.
2. dotnet/aspnetcore PR [#68834](https://github.com/dotnet/aspnetcore/pull/68834): Validate COSE ALG+CRV combination when decoding passkey CredentialPublicKey.
3. W3C, [Web Authentication: An API for accessing Public Key Credentials, Level 3](https://www.w3.org/TR/webauthn-3/), §5.8.5 Cryptographic Algorithm Identifier.
4. J. Schaad, [RFC 9053: CBOR Object Signing and Encryption (COSE): Initial Algorithms](https://www.rfc-editor.org/rfc/rfc9053.html), §2.1 ECDSA, 2022.
5. M. Jones, [RFC 8812: CBOR Object Signing and Encryption (COSE) and JSON Object Signing and Encryption (JOSE) Registrations for Web Authentication (WebAuthn) Algorithms](https://www.rfc-editor.org/rfc/rfc8812.html), 2020.
6. NIST, [FIPS 186-5: Digital Signature Standard (DSS)](https://csrc.nist.gov/pubs/fips/186-5/final), 2023.
7. Microsoft Learn, [ASP.NET Core passkeys documentation](https://learn.microsoft.com/aspnet/core/security/authentication/passkeys/).
