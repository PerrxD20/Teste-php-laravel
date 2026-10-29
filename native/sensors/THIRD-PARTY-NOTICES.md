# Native sensor collector notices

This executable includes the unmodified **LibreHardwareMonitorLib 0.9.6** NuGet package,
licensed under Mozilla Public License 2.0. Its complete license is in
`licenses/LibreHardwareMonitor-MPL-2.0.txt`.

Corresponding upstream source is available at:
https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/tree/v0.9.6
NuGet package source commit: `3d331e3370efb858411f19511373eff65a218701`.
No upstream library source files were modified by this application.

The build's generated `licenses/NuGet-Packages.json` and copied `.nuspec`/license
files identify all exact third-party package versions, copyright and licenses.
The self-contained .NET runtime license and third-party notices are included
under `licenses/dotnet-runtime/` when published.

PawnIO is a separate optional system driver. This collector neither installs
it nor elevates permissions. CPU/board sensor coverage can depend on PawnIO
2.0+ and administrator rights. Readings can remain unavailable on unsupported
hardware or virtual machines. Opening this collector never changes fan curves,
clock settings, voltages or hardware control parameters.

LibreHardwareMonitorLib embeds the **unmodified signed PawnIO.Modules 0.1.6**
bytecode modules, licensed under LGPL 2.1. Their license and upstream provenance
are included in `licenses/PawnIO-Modules-*`. Corresponding source:
https://github.com/namazso/PawnIO.Modules/tree/0.1.6 . This is distinct from
redistributing or installing the PawnIO kernel driver. Libraries remain separate,
replaceable DLLs; this application does not restrict replacement/debugging of
these third-party components for the purposes permitted by their licenses.

Mono.Posix.NETStandard is a transitive NuGet compatibility dependency whose
runtime/native assets are explicitly excluded from this Windows distribution.
The Windows-specific LibreHardwareMonitorLib assembly does not reference it.
