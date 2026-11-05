# Third-party components and notices

The desktop in `desktop-web/` uses Electron (MIT, including Chromium
and its bundled third-party notices), Next.js (MIT), React/React DOM (MIT), and the
same OFL fonts used by the website. Electron's `LICENSE` and
`LICENSES.chromium.html`, the frontend package licenses and the font notices must
accompany the desktop distribution. The local test installer includes the
unmodified Electron runtime, exported frontend and their license notices. Its
offline document reader includes the component notices and the complete Chromium
notices. The inventory below also describes the retained legacy executable.

RPForge version 0.3.2 and later use a proprietary license for first-party code. That license does not replace the terms
of its dependencies, Windows system libraries or build tools.

| Component | Role | Version source | License / notice |
| --- | --- | --- | --- |
| Node.js | Unmodified runtime for the converter | `build/toolchains.json` | MIT and the third-party notices in the upstream `LICENSE` |
| `@xmldom/xmldom` | Runtime XML parser | `package-lock.json` | MIT; preserve the upstream package `LICENSE` |
| Pixelify Sans Regular and Bold | Fonts embedded in the desktop executable | Checked-in `desktop/fonts/*.ttf`, identified by SHA-256 in the SBOM | SIL Open Font License 1.1; complete notice in `desktop/fonts/OFL.txt`, embedded in Help and copied to `licenses/Pixelify-Sans-OFL.txt` |
| Atkinson Hyperlegible Regular and Bold | Body text embedded in the desktop executable and used in the user manual PDF | Checked-in `desktop/fonts/AtkinsonHyperlegible-*.ttf` | SIL Open Font License 1.1; complete notice in `desktop/fonts/Atkinson-OFL.txt` and embedded in Help |
| LLVM-MinGW runtime libraries | Statically linked native C++ support | Pinned LLVM-MinGW archive | Apache-2.0 with LLVM exceptions and the other applicable notices in the distribution's aggregate `LICENSE.TXT` |
| Microsoft .NET Framework | Windows system dependency for the current desktop app | .NET Framework 4.8 reference contract | Provided by Windows; not included in the signing bundle |
| `yaml` | Development-only workflow validation | `package-lock.json` | ISC; not included in production npm dependencies |
| Roslyn compiler | Build-only C# compiler | Pinned NuGet toolset | Upstream Microsoft/Roslyn package terms; compiler not shipped |
| .NET Framework reference assemblies | Build-only reference contract | Pinned NuGet package | Upstream NuGet package terms; reference assemblies not shipped |
| Windows SDK BuildTools | Optional future identity-package preparation | Pinned NuGet package | Upstream SDK terms; SDK not shipped |
| Inno Setup | Legacy local-test installer builder | Legacy build script | Inno Setup license; not executed or included by the SignPath binary preparation workflow |

The unsigned preparation build copies the complete project, Node.js, xmldom,
Pixelify Sans, Atkinson Hyperlegible and LLVM-MinGW notices into `licenses/`, and emits an inventory in `sbom.cdx.json`.
The aggregate LLVM notice includes tools as well as libraries; it is retained intact
to avoid dropping applicable upstream notices. The SBOM records native runtime linkage
without asserting that every component of the compiler distribution is shipped.

Upstream executable files must retain their existing signatures. `node.exe` is not
an allowed signing target in the project's SignPath artifact configuration.

The current signing bundle contains only the project's `RPFForge.exe` and
`ForgeShell.dll`, plus provenance, SBOM and notices. It is not an installer and does
not contain the third-party runtime executable or proprietary game assets.

Before a public release, review the final assembled payload again, including any new
dependencies introduced by the redesigned interface. This inventory covers the current
source and locked build path, not changes another implementation may add later.

Sources: [Node.js](https://github.com/nodejs/node/blob/main/LICENSE),
[xmldom](https://github.com/xmldom/xmldom/blob/master/LICENSE),
[LLVM-MinGW](https://github.com/mstorsjo/llvm-mingw),
[Roslyn](https://github.com/dotnet/roslyn),
[yaml](https://github.com/eemeli/yaml/blob/main/LICENSE).
