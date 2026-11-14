# vehiclelayouts.meta e `<layout>`: estrutura real (GTA V instalado)

Data: 13/11/2026. Pesquisa feita só com leitura do jogo. Nada foi gravado no repositório além do script-oráculo.

**Legenda:** **[V]** = verificado nos arquivos extraídos do jogo ou dos mods · **[I]** = inferido (comportamento do motor, convenção da comunidade, não comprovado por arquivo).

## 0. Como foi feito
- Script: `D:\RedHorn\Desenvolvimento\RPForge\scripts\vehicle-engine\Export-VehicleLayouts.ps1`. É um oráculo offline com CodeWalker.Core e **não roda no produto**. Ele lê `common.rpf`, `update\update*.rpf`, `x64*.rpf` (com RPFs aninhados) e `update\x64\dlcpacks\*\dlc.rpf`, e extrai só `vehiclelayouts*.meta` e `vehicles.meta`. Se o arquivo vier em PSO/RBF, ele converte para XML; aqui todos já vieram em **XML puro** [V]. Saída: 186 arquivos, cerca de 21 MB, em `...\scratchpad\layouts` (fora do repo).
- Atenção: `RpfFile.AllEntries` **não inclui** RPFs aninhados. Os DLCs antigos ficam em `x64w.rpf\dlcpacks\<dlc>\dlc.rpf` e só aparecem percorrendo `RpfFile.Children` [V].
- Ordem de prioridade usada na consolidação (a última vence) [I, é a ordem normal de montagem do jogo]: `common.rpf` < `update.rpf\common` < `dlcpacks\*\dlc.rpf` < `update.rpf\dlc_patch\*`.

## 1. Onde ficam os arquivos [V]
| Origem | Caminho dentro do RPF |
|---|---|
| Jogo base (original) | `common.rpf\data\ai\vehiclelayouts.meta` (90 layouts) |
| Jogo base (patch) | `update\update.rpf\common\data\ai\vehiclelayouts.meta` (92 layouts; substitui o anterior) |
| vehicles.meta base | `common.rpf\data\levels\gta5\vehicles.meta` e `update\update.rpf\common\data\levels\gta5\vehicles.meta` |
| DLCs atuais | `update\x64\dlcpacks\<dlc>\dlc.rpf\common\data\ai\vehiclelayouts*.meta` + `...\common\data\levels\gta5\vehicles.meta` |
| DLCs antigos | `x64w.rpf\dlcpacks\{mpbeach,mpbusiness,mpbusiness2,mpchristmas,mphipster,mpindependence,mplts,mppilot,mpvalentines,spupgrade}\dlc.rpf\common\data\...` |
| Patches de DLC | `update\update.rpf\dlc_patch\<dlc>\common\data\ai\vehiclelayouts*.meta` e `...\levels\gta5\vehicles.meta` |

Há arquivos por veículo além do `vehiclelayouts.meta` do pacote [V]:
- `_apc`, `_dune3`, `_halftrack`, `_trailer` (mpgunrunning)
- `_insurgent`, `_valkyrie` (mpheist)
- `_formula`, `_zhaba` (mpheist3)
- `_avisa`, `_longfin`, `_patrolboat` (mpheist4)
- `_phantombull`, `_wastelander` (mpimportexport)
- `_menacer` (mpbattle)
- `_bruiser`, `_issi4`, `_monster3`, `_scarab` (mpchristmas2018)
- `_rrocket`, `_s80` (mpvinewood)

A lista completa, com 186 linhas, está em `scratchpad\layouts\index.tsv`.

Os arquivos de DLC trazem **só as seções que acrescentam**. O mp2024_01, por exemplo, tem `VehicleCoverBoundOffsetInfos(10) VehicleDriveByAnimInfos(2) VehicleDriveByInfos(2) VehicleSeatInfos(2) VehicleSeatAnimInfos(2) VehicleEntryPointInfos(4) VehicleEntryPointAnimInfos(16) VehicleLayoutInfos(9) FirstPersonDriveByLookAroundData(40)`. Seções vazias aparecem como `<X />` [V].

## 2. Estrutura de `CVehicleMetadataMgr` [V]
A raiz é `<CVehicleMetadataMgr>` e as seções seguem esta ordem. Os números são de `update.rpf\common`:

| Seção | Tipo do Item | Qtd. |
|---|---|---|
| AnimRateSets | CAnimRateSet | 4 |
| ClipSetMaps | CClipSetMap | 426 |
| VehicleCoverBoundOffsetInfos | CVehicleCoverBoundOffsetInfo | 203 |
| BicycleInfos | CBicycleInfo | 5 |
| POVTuningInfos | CPOVTuningInfo | 17 |
| EntryAnimVariations | CEntryAnimVariations | 34 |
| VehicleExtraPointsInfos | CVehicleExtraPointsInfo | 73 |
| DrivebyWeaponGroups | CDrivebyWeaponGroup | 11 |
| VehicleDriveByAnimInfos | CVehicleDriveByAnimInfo | 208 |
| VehicleDriveByInfos | CVehicleDriveByInfo | 100 |
| VehicleSeatInfos | CVehicleSeatInfo | 65 |
| VehicleSeatAnimInfos | CVehicleSeatAnimInfo | 157 |
| VehicleEntryPointInfos | CVehicleEntryPointInfo | 162 |
| VehicleEntryPointAnimInfos | CVehicleEntryPointAnimInfo | 249 |
| VehicleExplosionInfos | CVehicleExplosionInfo | 22 |
| VehicleLayoutInfos | CVehicleLayoutInfo | 92 |
| VehicleScenarioLayoutInfos | CVehicleScenarioLayoutInfo | 3 |
| SeatOverrideAnimInfos | CSeatOverrideAnimInfo | 7 |
| InVehicleOverrideInfos | CInVehicleOverrideInfo | 9 |
| FirstPersonDriveByLookAroundData | CFirstPersonDriveByLookAroundData | 409 |

Os nomes que estavam na pergunta conferem com o jogo. Todo item tem `<Name>`, e as referências entre itens usam `<Campo ref="NOME" />`, com `ref="NULL"` para nenhuma [V].

### Grafo de referências [V]
```
vehicles.meta <layout> ──► CVehicleLayoutInfo
  Seats[]       : SeatInfo ref ──► CVehicleSeatInfo (SeatBoneName = osso no YFT)
                  SeatAnimInfo ref ──► CVehicleSeatAnimInfo
                       DriveByInfo ref ──► CVehicleDriveByInfo ──► DriveByAnimInfos[] ──► CVehicleDriveByAnimInfo ──► WeaponGroup ref ──► CDrivebyWeaponGroup
                       InsideClipSetMap ref ──► CClipSetMap (clipset sentado)
  EntryPoints[] : EntryPointInfo ref ──► CVehicleEntryPointInfo (porta/maçaneta/janela/lado; AccessableSeats[] ──► SeatInfo; VehicleExtraPointsInfo ref)
                  EntryPointAnimInfo ref ──► CVehicleEntryPointAnimInfo ──► Common/Entry/ExitClipSetMap ──► CClipSetMap; EntryAnimVariations ref
  BicycleInfo ref, AnimRateSet ref
vehicles.meta <firstPersonDrivebyData><Item>NOME</Item> ──► CFirstPersonDriveByLookAroundData (1 por assento, na ordem dos assentos)
vehicles.meta <POVTuningInfo>NOME ──► CPOVTuningInfo (motos/quadriciclos; 126 ocorrências)
vehicles.meta <coverBoundOffsets> ──► CVehicleCoverBoundOffsetInfo; <explosionInfo> ──► CVehicleExplosionInfo; <scenarioLayout> ──► CVehicleScenarioLayoutInfo
```
O mapeamento "1 item de `firstPersonDrivebyData` por assento, na ordem" é **[I]**. Ele foi deduzido dos nomes `LOW_ADDER_FRONT_LEFT` e `LOW_ADDER_FRONT_RIGHT` do adder, que tem 2 assentos.

### CVehicleLayoutInfo [V]
Campos encontrados: `Name, Seats, EntryPoints, LayoutFlags, BicycleInfo, HandsUpClipSetId, SteeringWheelOffset, AnimRateSet, MaxXAcceleration, BodyLeanXApproachSpeed, BodyLeanXSmallDelta, LookBackApproachSpeedScale, FirstPersonAdditiveIdleClipSets, FirstPersonRoadRageClipSets, CellphoneClipsets`.
```xml
<Item type="CVehicleLayoutInfo"><Name>LAYOUT_STANDARD</Name>
 <Seats><Item><SeatInfo ref="SEAT_STANDARD_FRONT_LEFT" /><SeatAnimInfo ref="SEAT_ANIM_STANDARD_FRONT_LEFT" /></Item> ...(4)</Seats>
 <EntryPoints><Item><EntryPointInfo ref="ENTRY_POINT_STANDARD_FRONT_LEFT" /><EntryPointAnimInfo ref="ENTRY_POINT_ANIM_STANDARD_FRONT_LEFT" /></Item> ...(4)</EntryPoints>
 <LayoutFlags>StreamAnims UseDoorOscillation UseLeanSteerAnims UseSteeringWheelIk</LayoutFlags>
 <BicycleInfo ref="NULL" /><AnimRateSet ref="STD_LOW_ANIM_RATE_SET" /><HandsUpClipSetId>busted_vehicle_std</HandsUpClipSetId>
 <SteeringWheelOffset x="0.000000" y="0.350000" z="0.320000" /><MaxXAcceleration value="4.00000" />
 <BodyLeanXApproachSpeed value="5.00000" /><BodyLeanXSmallDelta value="0.30000" /><LookBackApproachSpeedScale value="1.00000" />
 <FirstPersonAdditiveIdleClipSets><Item>clipset@veh@std@ds@idle_a</Item>...</FirstPersonAdditiveIdleClipSets>
 <FirstPersonRoadRageClipSets><Item>clipset@veh@std@ds@hit_wheel@idle_a</Item>...</FirstPersonRoadRageClipSets></Item>
```
Valores de `LayoutFlags` encontrados [V]:
- AllowEarlyDoorAndSeatUnreservation
- AutomaticCloseDoor
- BikeLeansUnlessMoving
- ClimbUpAfterOpenDoor
- DisableFastPoseWhenDrivebying
- DisableJackingAndBusting
- DisableTargetRearDoorOpenRatio
- IgnoreFrontSeatsWhenOnVehicle
- LockedForSpecialEdition
- MustCloseDoor
- NoArmIkOnInsideCloseDoor
- NoArmIkOnOutsideCloseDoor
- NoArmIkOnOutsideOpenDoor
- NoDriver
- OnlyExitIfDoorIsClosed
- PreventInterruptAfterClimbUp
- PreventInterruptAfterOpenDoor
- PreventJustPullingOut
- StreamAnims
- Use2DBodyBlend
- UseDoorOscillation
- UseFinerAlignTolerance
- UseLeanSteerAnims
- UseLowerDoorBlockTest
- UsePickUpPullUp
- UseSteeringWheelIk
- UseStillToSitTransition
- UseVanOpenDoorBlendParams
- WaitForRerservationInGroup
- WarpIntoAndOut
- WarpInWhenStoodOnTop

### CVehicleSeatInfo [V]
Campos: `Name, SeatBoneName, ShuffleLink, RearSeatLink, DefaultCarTask, SeatFlags, HairScale, ShuffleLink2`.
```xml
<Item type="CVehicleSeatInfo"><Name>SEAT_STANDARD_FRONT_LEFT</Name><SeatBoneName>seat_dside_f</SeatBoneName>
 <ShuffleLink>SEAT_STANDARD_FRONT_RIGHT</ShuffleLink><RearSeatLink>SEAT_STANDARD_REAR_LEFT</RearSeatLink>
 <DefaultCarTask>TASK_DRIVE_WANDER</DefaultCarTask><SeatFlags>IsFrontSeat</SeatFlags><HairScale value="-0.2750000" /></Item>
```
- `SeatBoneName` é o osso do YFT onde o ped é posicionado.
- `ShuffleLink` e `ShuffleLink2` apontam o assento para onde o ped desliza. `ShuffleLink2` aparece em 68 itens, por exemplo `SEAT_PLANE_TITAN2_REAR_RIGHT_2`.
- `RearSeatLink` aponta o assento de trás correspondente.

Valores de `SeatFlags` [V]:
- CameraSkipWaitingForTurretAlignment
- DisableFinerAlignTolerance
- DisableWhenTrailerAttached
- DisallowHeadProp
- DontDetachOnWorldCollision
- FakeSeat
- GivePilotHelmetForSeat
- IsExtraShuffleSeat
- IsFrontSeat
- IsIdleSeat
- IsRearSeatWithActivities
- KeepOnHeadProp
- NoIndirectExit
- PedInSeatTargetable
- PreventIdleCloseDoor
- PreventJackInWater
- PrioritizeRearSeatEntry
- UseSweepLoopsForTurret
- UseSweepsForTurret

### CVehicleSeatAnimInfo (animações sentado) [V]
Campos:
- Name, DriveByInfo, InsideClipSetMap
- PanicClipSet, AgitatedClipSet, DuckedClipSet, FemaleClipSet
- LowriderLeanClipSet, AltLowriderLeanClipSet, LowLODIdleAnim
- SeatAmbientContext, InVehicleMoveNetwork, SeatAnimFlags, SteeringSmoothing
- ExitToAimInfoName, MaleGestureClipSetId, FemaleGestureClipSetId
- SeatCollisionBoundsOffset, FPSMinSteeringRateOverride, FPSMaxSteeringRateOverride

```xml
<Item type="CVehicleSeatAnimInfo"><Name>SEAT_ANIM_STANDARD_FRONT_LEFT</Name><DriveByInfo ref="DRIVEBY_STANDARD_FRONT_LEFT" />
 <InsideClipSetMap ref="INSIDE_CLIPSET_MAP_STD_FRONT_LEFT" /><PanicClipSet>clipset@veh@std@ds@idle_panic</PanicClipSet>
 <AgitatedClipSet>clipset@veh@std@ds@idle_agitated</AgitatedClipSet><DuckedClipSet>clipset@veh@std@ds@idle_duck</DuckedClipSet><FemaleClipSet />
 <LowLODIdleAnim>STD_CAR_FRONT_DS_IDLE</LowLODIdleAnim><SeatAmbientContext>IN_CAR_STANDARD</SeatAmbientContext>
 <InVehicleMoveNetwork>VEHICLE_DEFAULT</InVehicleMoveNetwork><SeatAnimFlags>UseStandardInVehicleAnims UseCloseDoorBlendAnims</SeatAnimFlags>
 <SteeringSmoothing value="0.040000" /><ExitToAimInfoName>STANDARD</ExitToAimInfoName>
 <MaleGestureClipSetId>ANIM_GROUP_GESTURE_M_CAR_STD_DS</MaleGestureClipSetId><FemaleGestureClipSetId>ANIM_GROUP_GESTURE_F_CAR_STD_DS</FemaleGestureClipSetId></Item>
<!-- InsideClipSetMap resolve para: -->
<Item type="CClipSetMap"><Name>INSIDE_CLIPSET_MAP_STD_FRONT_LEFT</Name><Maps><Item><ClipSetId>clipset@veh@std@ds@base</ClipSetId><VarClipSetId>InsideVarClipSet</VarClipSetId><ConditionFlags /><InformationFlags /></Item></Maps></Item>
```

### CVehicleEntryPointInfo (pontos de entrada) [V]
Campos: `Name, DoorBoneName, SecondDoorBoneName, DoorHandleBoneName, WindowId, VehicleSide, AccessableSeats, VehicleExtraPointsInfo, Flags, BlockJackReactionSides, BreakoutTestPoint`.
```xml
<Item type="CVehicleEntryPointInfo"><Name>ENTRY_POINT_STANDARD_FRONT_LEFT</Name><DoorBoneName>door_dside_f</DoorBoneName><SecondDoorBoneName />
 <DoorHandleBoneName>handle_dside_f</DoorHandleBoneName><WindowId>FRONT_LEFT</WindowId><VehicleSide>SIDE_LEFT</VehicleSide>
 <AccessableSeats><Item ref="SEAT_STANDARD_FRONT_LEFT" /></AccessableSeats><VehicleExtraPointsInfo ref="EXTRA_VEHICLE_POINTS_STD_LEFT" />
 <Flags>BlockJackReactionUntilJackerIsReady</Flags><BlockJackReactionSides><Item>SIDE_LEFT</Item></BlockJackReactionSides></Item>
```
- `WindowId`: FRONT_LEFT, FRONT_RIGHT, REAR_LEFT, REAR_RIGHT, MID_LEFT, MID_RIGHT, FRONT_WINDSCREEN, REAR_WINDSCREEN, INVALID.
- `VehicleSide`: SIDE_LEFT, SIDE_RIGHT e outros.
- `BreakoutTestPoint` (ex.: `GET_IN`) aparece em 466 itens.

Valores de `Flags` [V]:
- AutoCloseThisDoor
- BlockJackReactionUntilJackerIsReady
- ClimbUpOnly
- CloseDoorAfterClimbDown
- ForceSkyDiveExitInAir
- HasClimbDownToWater
- IgnoreSmashWindowCheck
- IsPassengerOnlyEntry
- IsPlaneHatchEntry
- MPWarpInOut
- NotUsableOutsideVehicle
- SPEntryAllowedAlso
- TryLockedDoorOnGround
- UseFirstMulipleAccessSeatForDirectEntryPoint (grafia do jogo)

`VehicleExtraPointsInfo` → `CVehicleExtraPointsInfo.ExtraVehiclePoints[]`. Cada ponto tem LocationType, PointType, Position, Heading e BoneName; o único osso encontrado foi `wheel_lf` [V].

### CVehicleEntryPointAnimInfo [V]
Campos:
- Name, CommonClipSetMap, EntryClipSetMap, ExitClipSetMap
- AlternateTryLockedDoorClipId, AlternateForcedEntryClipId, AlternateJackFromOutSideClipId, AlternateBeJackedFromOutSideClipId, AlternateEntryPointClipSetId
- EnterVehicleMoveNetwork, EntryTranslation, OpenDoorTranslation, OpenDoorHeadingChange, EntryHeadingChange
- ExtraZForWaterEntry, EntryPointFlags, EntryAnimVariations, NMJumpFromVehicleTuningSet, ExtraZForMPPlaneWarp

```xml
<Item type="CVehicleEntryPointAnimInfo"><Name>ENTRY_POINT_ANIM_STANDARD_FRONT_LEFT</Name><CommonClipSetMap ref="COMMON_CLIPSET_MAP_AUTOMOBILE_LEFT" />
 <EntryClipSetMap ref="ENTRY_CLIPSET_MAP_STD_FRONT_LEFT" /><ExitClipSetMap ref="EXIT_CLIPSET_MAP_STD_FRONT_LEFT" />
 <AlternateTryLockedDoorClipId>STD_Locked_DS</AlternateTryLockedDoorClipId><AlternateForcedEntryClipId>STD_Force_Entry_DS</AlternateForcedEntryClipId>
 <AlternateJackFromOutSideClipId>std_perp_ds</AlternateJackFromOutSideClipId><AlternateBeJackedFromOutSideClipId>std_victim_ds</AlternateBeJackedFromOutSideClipId>
 <AlternateEntryPointClipSetId>clipset@veh@std@ds@female@enter_exit</AlternateEntryPointClipSetId><EnterVehicleMoveNetwork>ENTER_VEHICLE_STD</EnterVehicleMoveNetwork>
 <EntryTranslation x="-0.842000" y="-0.551000" z="0.500000" /><OpenDoorTranslation x="-0.050000" y="0.150000" />
 <OpenDoorHeadingChange value="1.570000" /><EntryHeadingChange value="-1.570000" /><ExtraZForWaterEntry value="0.000000" />
 <EntryPointFlags>JackIncludesGetIn UsesNoDoorTransitionForExit UseOpenDoorBlendAnims UseGetUpAfterJack JackVariationsIncludeGetIn HasCombatEntry</EntryPointFlags>
 <EntryAnimVariations ref="ENTRY_ANIM_VARIATIONS_STANDARD_FRONT_LEFT" /><NMJumpFromVehicleTuningSet>Standard</NMJumpFromVehicleTuningSet></Item>
```
A posição em que o ped para fora do carro é dada por `EntryTranslation` e `EntryHeadingChange`, relativa à porta ou ao assento. Essa leitura é [I], porque o arquivo não diz o referencial.

### Drive-by [V]
- O assento referencia `SeatAnimInfo.DriveByInfo`.
- `CVehicleDriveByInfo` traz os limites de mira:
  - Min/MaxAimSweepHeadingAngleDegs, FirstPerson*, FirstPersonUnarmed*, Min/MaxRestricted*
  - Min/MaxSmashWindowAngle*, MaxSpeedParam, lean/spine blend
  - Min/MaxUnarmedDrivebyYawIfWindowRolledUp
  - `DriveByAnimInfos[]`, DriveByCamera, PovDriveByCamera, DriveByFlags
- `CVehicleDriveByAnimInfo` tem: WeaponGroup ref, DriveByClipSet, FirstPersonDriveByClipSet, AltFirstPersonDriveByClipSets, Network, RestrictedDriveByClipSet, VehicleMeleeClipSet, FirstPersonVehicleMeleeClipSet e Override*AimAngle.
- `CDrivebyWeaponGroup` tem: Name, WeaponGroupNames, WeaponTypeNames. Exemplo: `DRIVEBY_DEFAULT_UNARMED` contém WEAPON_UNARMED e OBJECT.

### Câmera de 1ª pessoa [V]
- No `vehicles.meta`:
  - `povCameraName` (ex.: DEFAULT_POV_CAMERA)
  - `PovCameraOffset x/y/z` (adder: 0, −0.19, 0.63)
  - `PovCameraVerticalAdjustmentForRollCage`, `PovPassengerCameraOffset`, `PovRearPassengerCameraOffset`
  - `povTurretCameraName`, `POVTuningInfo` (motos)
  - `FirstPersonDriveByIKOffset` e família (`...Unarmed...`, `...Projectile...`, `...Passenger...`)
  - `FirstPersonMobilePhoneOffset`, `FirstPersonPassengerMobilePhoneOffset`
  - `FirstPersonMobilePhoneSeatIKOffset` (lista `Offset` + `SeatIndex`)
  - `firstPersonDrivebyData`
- `CFirstPersonDriveByLookAroundData` tem: Name, AllowLookback, HeadingLimits, DataLeft/DataRight (`Offsets[]` com Offset e AngleToBlendInOffset, ExtraRelativePitch, AngleToBlendInExtraPitch) e WheelClipInfo.
- `CPOVTuningInfo` tem: StickCenteredBodyLeanY*, BodyLeanXDeltaFromCenter*, Min/MaxForwardsPitch*, CameraPitchOffset.
- Outros campos do `vehicles.meta` ligados a assento: `numSeatsOverride` (344 ocorrências), `minSeatHeight`, `driveableDoors`, `doorsWithCollisionWhenClosed`.

### Ossos que o jogo procura no YFT [V, união de todos os SeatInfo/EntryPointInfo]
- **Assentos:**
  - `seat_dside_f`, `seat_pside_f`
  - `seat_dside_r`, `seat_pside_r`
  - `seat_dside_r1`…`seat_dside_r6`, `seat_pside_r1`…`seat_pside_r6`
  - `seat_f`, `seat_r` (motos)
  - `seat_a`, `seat_b`, `seat_c`
- **Portas:** `door_dside_f`, `door_pside_f`, `door_dside_r`, `door_pside_r`, `boot` (traseira de vans e aviões).
- **Segunda porta:** só `door_pside_f`.
- **Maçanetas:** `handle_dside_f`, `handle_pside_f`, `handle_dside_r`, `handle_pside_r`, `handle_dside_r1`.
- **Pontos extras:** `wheel_lf`.
- **Janelas:** o meta não cita ossos `window_*`, só o enum `WindowId`. A ligação `FRONT_LEFT` → osso `window_lf` (e `window_rf`, `window_lr`, `window_rr`, `windscreen`, `windscreen_r`) é feita pelo motor [I].
- Quando o osso do assento não existe no YFT, o assento fica inutilizável ou o ped sai na origem [I, comportamento conhecido, não testado aqui].

## 3. Layouts do jogo [V]
- **386 `CVehicleLayoutInfo`** distintos (base + todos os DLCs + dlc_patch).
- **935 veículos** (modelName único). **Todos** apontam para um layout definido. Só 4 layouts não têm veículo: `LAYOUT_LOW_LAYOUT_LOW_COQUETTE5` (sic), `LAYOUT_LOW_NIOBE`, `LAYOUT_PLANE_VELUM2`, `LAYOUT_STD_KURUMA`.
- Distribuição por número de assentos:

  | Assentos | Layouts |
  |---:|---:|
  | 1 | 43 |
  | 2 | 166 |
  | 3 | 8 |
  | 4 | 117 |
  | 5 | 10 |
  | 6 | 20 |
  | 8 | 7 |
  | 9 | 1 |
  | 10 | 8 |
  | 11 | 2 |
  | 16 | 4 |

- Mais usados: STANDARD 84 · LOW 69 · LOW_RESTRICTED 47 · TRUCK 34 · STD_EXITFIXUP 25 · VAN 20 · BIKE_SPORT 18 · **STD_HIGHWINDOW 16** · BIKE_FREEWAY 14 · RANGER 14 · 4X4 10 · TRAIN 10.
- **`LAYOUT_STD_HIGHWINDOW` existe** [V]:
  - Definido em `common.rpf\data\ai\vehiclelayouts.meta` e redefinido em `update.rpf\common\...`.
  - 4 assentos: seat_dside_f, seat_pside_f, seat_dside_r, seat_pside_r. Usa os `SEAT_STANDARD_*` com `SEAT_ANIM_STD_HIGHWINDOW_*`.
  - 4 entradas: `ENTRY_POINT_STANDARD_*` com `ENTRY_POINT_ANIM_STD_BOBCAT_*`.
  - 16 veículos, por exemplo baller, baller2, baller7.
- Atenção: os DLCs antigos (mpbeach, mpbusiness, mpindependence...) usam layouts como `LAYOUT_STD_BASIC`, `LAYOUT_BOAT_SPEEDER`, `LAYOUT_LOW_TURISMOR`, `LAYOUT_PLANE_VESTRA`, `LAYOUT_TRUCK_MONSTER` e `LAYOUT_STD_HUNTLEY`. Eles só aparecem quando se lê `x64w.rpf\dlcpacks\...`.
- O JSON `layouts-catalogo.json` traz, para cada layout, os assentos (nome, osso, anim, shuffle, rear, flags, driveBy), as entradas (porta, maçaneta, janela, lado, assentos alcançados), a fonte e os veículos.

## 4. Como os mods estendem
Fontes: 522 `CVehicleMetadataMgr` em `crnetwork-main\resources\[addons]\[vehicles]` e a M3. Os dados são [V], salvo onde marcado.

**Tipos de arquivo encontrados:**

| Tipo | Arquivos |
|---|---:|
| Layout próprio, com nome novo (média de 1,7 layout por arquivo, máximo 31) | 463 |
| Cópia integral do vehiclelayouts do jogo (cerca de 1,8 MB, 92 layouts) | 39 |
| Só redefine layouts com nome do jogo | 8 |
| Sem layout: só `FirstPersonDriveByLookAroundData`, ou CoverBound + FPDLAD, ou vazio | 12 |

- **Seções usadas nos arquivos que não são cópia integral:**

  | Seção | Arquivos |
  |---|---:|
  | VehicleLayoutInfos | 466 |
  | VehicleEntryPointInfos | 300 |
  | VehicleSeatInfos | 248 |
  | SeatAnimInfos | 212 |
  | EntryPointAnimInfos | 212 |
  | ClipSetMaps | 86 |
  | CoverBound | 80 |
  | DriveByInfos | 57 |
  | DriveByAnimInfos | 52 |
  | EntryAnimVariations | 34 |
  | FirstPersonDriveByLookAroundData | 30 |
  | ExtraPoints | 21 |
  | POVTuning | 4 |

  O padrão é: layout novo que reaproveita `SEAT_*`, `SEAT_ANIM_*` e `ENTRY_POINT_*` do jogo, ou que cria poucos itens próprios.
- **Layouts nos vehicles.meta dos mods:** a maioria aponta para layout do jogo. LAYOUT_STANDARD 2404, LOW 1107, STD_HIGHWINDOW 1067, BIKE_DIRT 590, LOW_RESTRICTED 432. Os próprios mais usados são CDsw4 231, LOW_RHD 175, STD_BABYREMAP 138, LANCER 121.
- **fxmanifest:** `data_file 'VEHICLE_LAYOUTS_FILE' '<caminho>'` aparece em 36 manifests, quase sempre com glob:

  | Padrão | Manifests |
  |---|---:|
  | `data/layouts/*.meta` | 12 |
  | `data/vehiclelayouts.meta` | 10 |
  | `data/**/vehiclelayouts.meta` | 11 |
  | `data/**/layouts/*.meta` | 2 |

  O arquivo também precisa estar em `files{}`. A M3 segue o padrão simples (`data/vehiclelayouts.meta`).
- **M3 (REDHORNM3BIBIS):**
  - O `vehiclelayouts.meta` tem só `FirstPersonDriveByLookAroundData`, com `LOW_MASSACRO2_FRONT_LEFT` e `LOW_MASSACRO2_FRONT_RIGHT`, mais `<VehicleCoverBoundOffsetInfos />` vazio.
  - Esses dois nomes **já existem no jogo** (`dlcpacks\mpchristmas2\...\vehiclelayouts.meta`), então o arquivo **redefine** itens do jogo.
  - O `vehicles.meta` da M3 usa `LAYOUT_STD_HIGHWINDOW`, e o `<firstPersonDrivebyData>` aponta para `LOW_REDHORNM3BIBIS_FRONT_LEFT/RIGHT`. **Esses nomes não existem** nem no `vehiclelayouts.meta` da M3 nem no jogo: é uma referência quebrada, e o FPDLAD definido (`LOW_MASSACRO2_*`) não é usado. (Corrigido em 13/11: a primeira versão desta pesquisa dizia que a lista estava vazia; conferido em `REDHORNM3BIBIS\data\vehicles.meta`, linhas 112–115.)
  - O manifest diz "Convertido com RPForge".
- **Conflitos comuns** (dados [V], efeito [I]):
  1. O mesmo nome de layout próprio aparece em vários recursos. LAYOUT_LANCER 22×, LOW_RHD 21×, CDsw4 17×, R8 16×, AMAROK 15×. Na maioria são idênticos (LANCER, R8 e CDsw4 têm 1 variante cada), mas `LAYOUT_LOW_RHD` tem **2 variantes diferentes**. Vence o último carregado, o que afeta todos os carros que usam o nome [I].
  2. 102 itens seat/entry/anim de mods **reutilizam nomes do jogo** com conteúdo próprio, por exemplo `SEAT_ANIM_STANDARD_FRONT_LEFT`, `SEAT_EXTRA_RIGHT_4`, `ENTRY_POINT_ANIM_VAN_SIDE_LEFT`. Isso pode alterar todos os carros vanilla [I].
  3. As 39 cópias integrais reinjetam o vehiclelayouts base inteiro, o que reverte patches de DLC aplicados depois do base [I].
  4. Um nome de `firstPersonDrivebyData` ou `layout` sem definição carregada vira referência quebrada [I].
- **Recomendação para o editor** (inferência, não verificado):
  - Gerar layout com nome exclusivo, com prefixo do recurso.
  - Reaproveitar os `SEAT_*`, `ENTRY_POINT_*` e `*_ANIM_*` do jogo por `ref`.
  - Não redefinir nomes do jogo.
  - Emitir só as seções necessárias.

## 5. Tabela completa de LAYOUT_* (386)
Colunas:
- **Veículos:** quantidade de modelName nos vehicles.meta do jogo (base + DLC + dlc_patch).
- **Fonte:** primeira definição.
- `?` no osso = SeatInfo não resolvido (não ocorreu).

| Layout | Assentos | Entradas | Ossos de assento | Veiculos | Exemplos | Fonte (1a definicao) |
|---|---:|---:|---|---:|---|---|
| LAYOUT_4X4 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 10 | crusader, dubsta, dubsta2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_4X4_DUBSTA | 6 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_pside_r2 | 1 | dubsta3 | x64w/dlcpacks/mphipster/vehiclelayouts.meta |
| LAYOUT_BICYCLE_BMX | 1 | 2 | seat_f | 1 | bmx | common.rpf/vehiclelayouts.meta |
| LAYOUT_BICYCLE_CRUISER | 1 | 2 | seat_f | 1 | cruiser | common.rpf/vehiclelayouts.meta |
| LAYOUT_BICYCLE_FIXTER | 1 | 2 | seat_f | 1 | fixter | common.rpf/vehiclelayouts.meta |
| LAYOUT_BICYCLE_MOUNTAIN | 1 | 2 | seat_f | 3 | inductor, inductor2, scorcher | common.rpf/vehiclelayouts.meta |
| LAYOUT_BICYCLE_ROAD | 1 | 2 | seat_f | 3 | tribike, tribike2, tribike3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_CHOPPER | 2 | 4 | seat_f seat_r | 4 | daemon, daemon2, zombiea | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_DIRT | 2 | 4 | seat_f seat_r | 6 | bf400, enduro, esskey | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_FREEWAY | 2 | 4 | seat_f seat_r | 14 | avarus, bagger, cliffhanger | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_FREEWAY_CHIMERA | 2 | 4 | seat_f seat_r | 3 | chimera, ratbike, wolfsbane | dlcpacks/mpbiker/vehiclelayouts.meta |
| LAYOUT_BIKE_MANCHEZ2 | 1 | 2 | seat_f | 2 | manchez2, manchez3 | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_BIKE_POLICE | 1 | 2 | seat_f | 3 | policeb, policeb2, sovereign | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_QUAD | 1 | 2 | seat_dside_f | 4 | blazer, blazer2, blazer3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_QUAD_AQUA | 1 | 2 | seat_dside_f | 1 | blazer5 | dlcpacks/mpimportexport/vehiclelayouts.meta |
| LAYOUT_BIKE_QUAD_VERUS | 2 | 3 | seat_dside_f seat_dside_r | 1 | verus | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_BIKE_RROCKET | 1 | 3 | seat_f | 1 | rrocket | dlcpacks/mpvinewood/vehiclelayouts_rrocket.meta |
| LAYOUT_BIKE_SCOOTER | 2 | 4 | seat_f seat_r | 4 | faggio, faggio2, faggio3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_SPORT | 2 | 4 | seat_f seat_r | 18 | akuma, carbonrs, defiler | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_SPORT_BATI | 2 | 4 | seat_f seat_r | 4 | bati, bati2, diablous2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BIKE_SPORT_OPPRESSOR | 1 | 2 | seat_f | 1 | oppressor | dlcpacks/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_BIKE_SPORT_OPPRESSOR2 | 1 | 2 | seat_f | 1 | oppressor2 | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_BISON | 6 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_pside_r2 | 3 | bison, bison2, bison3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BLIMP | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | blimp | common.rpf/vehiclelayouts.meta |
| LAYOUT_BLIMP2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | blimp2 | x64w/dlcpacks/spupgrade/vehiclelayouts.meta |
| LAYOUT_BLIMP3 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | blimp3 | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_BOAT_AVISA | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | avisa | dlcpacks/mpheist4/vehiclelayouts_avisa.meta |
| LAYOUT_BOAT_DINGHY | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | dinghy, dinghy2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_DINGHY3 | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | dinghy3, dinghy4 | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_BOAT_DINGHY5 | 5 | 10 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 | 1 | dinghy5 | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_BOAT_JETMAX | 2 | 6 | seat_dside_f seat_pside_f | 1 | jetmax | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_JETSKI | 2 | 4 | seat_dside_f seat_pside_r | 3 | seashark, seashark2, seashark3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_LONGFIN | 4 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | longfin | dlcpacks/mpheist4/vehiclelayouts_longfin.meta |
| LAYOUT_BOAT_MARQUIS | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | marquis | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_PATROLBOAT | 4 | 10 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | patrolboat | dlcpacks/mpheist4/vehiclelayouts_patrolboat.meta |
| LAYOUT_BOAT_PREDATOR | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | predator | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_SPEEDER | 4 | 7 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | speeder, speeder2 | x64w/dlcpacks/mpbeach/vehiclelayouts.meta |
| LAYOUT_BOAT_SQUALO | 2 | 4 | seat_dside_f seat_pside_f | 1 | squalo | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_SUBMERSIBLE | 1 | 2 | seat_dside_f | 2 | kosatka, submersible | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_SUBMERSIBLE2 | 1 | 3 | seat_dside_f | 1 | submersible2 | x64w/dlcpacks/spupgrade/vehiclelayouts.meta |
| LAYOUT_BOAT_SUNTRAP | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | suntrap | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_TORO | 4 | 7 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | toro, toro2 | dlcpacks/mpluxe2/vehiclelayouts.meta |
| LAYOUT_BOAT_TROPIC | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | tropic, tropic2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_BOAT_TUG | 1 | 3 | seat_dside_f | 1 | tug | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_BULLDOZER | 1 | 2 | seat_dside_f | 1 | bulldozer | common.rpf/vehiclelayouts.meta |
| LAYOUT_BUS | 16 | 7 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 seat_dside_r4 seat_pside_r4 seat_dside_r5 seat_pside_r5 seat_dside_r6 seat_pside_r6 | 2 | airbus, bus | common.rpf/vehiclelayouts.meta |
| LAYOUT_COACH | 10 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 1 | coach | common.rpf/vehiclelayouts.meta |
| LAYOUT_CRANE | 1 | 1 | seat_dside_f | 1 | handler | common.rpf/vehiclelayouts.meta |
| LAYOUT_CUTTER | 1 | 1 | seat_dside_f | 1 | cutter | common.rpf/vehiclelayouts.meta |
| LAYOUT_DUMPTRUCK | 1 | 1 | seat_dside_f | 1 | dump | common.rpf/vehiclelayouts.meta |
| LAYOUT_FIRETRUCK | 8 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 | 1 | firetruk | common.rpf/vehiclelayouts.meta |
| LAYOUT_FORK_LIFT | 1 | 2 | seat_dside_f | 1 | forklift | common.rpf/vehiclelayouts.meta |
| LAYOUT_HELI | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | buzzard2, maverick, polmav | common.rpf/vehiclelayouts.meta |
| LAYOUT_HELI_AKULA | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | akula | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_HELI_ANNIHILATOR | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 1 | annihilator | common.rpf/vehiclelayouts.meta |
| LAYOUT_HELI_ANNIHILATOR2 | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 1 | annihilator2 | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_HELI_BUZZARD | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | buzzard | common.rpf/vehiclelayouts.meta |
| LAYOUT_HELI_CARGOBOB | 10 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 4 | cargobob, cargobob2, cargobob3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_HELI_CARGOBOB5 | 16 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 seat_dside_r4 seat_pside_r4 seat_dside_r5 seat_pside_r5 seat_dside_r6 seat_pside_r6 | 1 | cargobob5 | dlcpacks/mp2024_02/vehiclelayouts.meta |
| LAYOUT_HELI_CONADA | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | conada | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_HELI_CONADA2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | conada2 | dlcpacks/mp2023_01/vehiclelayouts.meta |
| LAYOUT_HELI_FROGGER | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | frogger, frogger2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_HELI_HAVOK | 1 | 2 | seat_dside_f | 1 | havok | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_HELI_HUNTER | 2 | 4 | seat_pside_f seat_dside_f | 1 | hunter | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_HELI_MAVERICK2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | maverick2 | dlcpacks/mp2025_01/vehiclelayouts.meta |
| LAYOUT_HELI_SAVAGE | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | savage | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_HELI_SEASPARROW2 | 2 | 2 | seat_dside_f seat_pside_f | 2 | seasparrow2, seasparrow3 | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_HELI_SKYLIFT | 2 | 2 | seat_dside_f seat_pside_f | 1 | skylift | common.rpf/vehiclelayouts.meta |
| LAYOUT_HELI_SPARROW | 2 | 2 | seat_dside_f seat_pside_f | 1 | seasparrow | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_HELI_SVOL | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | supervolito, supervolito2 | dlcpacks/mpapartment/vehiclelayouts.meta |
| LAYOUT_HELI_SWIFT | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | swift | x64w/dlcpacks/mppilot/vehiclelayouts.meta |
| LAYOUT_HELI_SWIFT2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | swift2 | dlcpacks/mpluxe/vehiclelayouts.meta |
| LAYOUT_HELI_THRUSTER | 1 | 1 | seat_dside_f | 1 | thruster | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_HELI_VALKYRIE | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r2 seat_pside_r2 | 1 | valkyrie | dlcpacks/mpheist/vehiclelayouts_valkyrie.meta |
| LAYOUT_HELI_VALKYRIE2 | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r2 seat_pside_r2 | 1 | valkyrie2 | dlcpacks/mpapartment/vehiclelayouts.meta |
| LAYOUT_HELI_VOLATUS | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | volatus | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_JEEP_WINKY | 3 | 4 | seat_dside_f seat_pside_f seat_dside_r | 1 | winky | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_LOW | 2 | 2 | seat_dside_f seat_pside_f | 69 | arbitergt, banshee, banshee2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_AUTARCH | 2 | 2 | seat_dside_f seat_pside_f | 1 | autarch | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_LOW_BANSHEE3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | banshee3 | dlcpacks/mp2024_02/vehiclelayouts.meta |
| LAYOUT_LOW_BFINJECTION | 2 | 2 | seat_dside_f seat_pside_f | 1 | bfinjection | common.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_BLADE | 2 | 2 | seat_dside_f seat_pside_f | 1 | blade | x64w/dlcpacks/mphipster/vehiclelayouts.meta |
| LAYOUT_LOW_CALICO | 2 | 2 | seat_dside_f seat_pside_f | 1 | calico | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_LOW_CARTUCCIA | 2 | 2 | seat_dside_f seat_pside_f | 1 | cartuccia | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_LOW_CHEETAH | 2 | 2 | seat_dside_f seat_pside_f | 1 | cheetah | common.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_CORSITA | 2 | 2 | seat_dside_f seat_pside_f | 2 | corsita, virtue | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_LOW_DELUXO | 2 | 2 | seat_dside_f seat_pside_f | 1 | deluxo | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_LOW_DOMINATOR3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | dominator3 | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_LOW_DUKES2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | dukes2 | x64w/dlcpacks/spupgrade/vehiclelayouts.meta |
| LAYOUT_LOW_DUNE | 2 | 2 | seat_dside_f seat_pside_f | 6 | bifta, dune, dune2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_DUNE3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | dune3 | dlcpacks/mpgunrunning/vehiclelayouts_dune3.meta |
| LAYOUT_LOW_ENTITY3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | entity3 | dlcpacks/mpchristmas3/vehiclelayouts.meta |
| LAYOUT_LOW_ENTITYXF | 2 | 2 | seat_dside_f seat_pside_f | 3 | entityxf, fmj, gb200 | common.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_EUROSX32 | 2 | 2 | seat_dside_f seat_pside_f | 1 | eurosx32 | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_LOW_FELTZER3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | feltzer3 | dlcpacks/mpluxe/vehiclelayouts.meta |
| LAYOUT_LOW_FMJ2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | fmj2 | dlcpacks/mp2025_02/vehiclelayouts.meta |
| LAYOUT_LOW_FURIA | 2 | 2 | seat_dside_f seat_pside_f | 1 | furia | dlcpacks/mpheist3/vehiclelayouts.meta |
| LAYOUT_LOW_FURORE | 2 | 2 | seat_dside_f seat_pside_f | 1 | furoregt | x64w/dlcpacks/mplts/vehiclelayouts.meta |
| LAYOUT_LOW_GT750 | 2 | 2 | seat_dside_f seat_pside_f | 2 | gt750, itali2 | dlcpacks/mp2025_02/vehiclelayouts.meta |
| LAYOUT_LOW_HORUS | 2 | 2 | seat_dside_f seat_pside_f | 1 | horus | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_LOW_IGNUS | 2 | 2 | seat_dside_f seat_pside_f | 2 | ignus, polignus | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_LOW_IGNUS2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | ignus2 | dlcpacks/mpg9ec/vehiclelayouts.meta |
| LAYOUT_LOW_INFERNUS | 2 | 2 | seat_dside_f seat_pside_f | 6 | cyclone2, deveste, infernus | common.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_INFERNUS2 | 2 | 2 | seat_dside_f seat_pside_f | 2 | gp1, infernus2 | dlcpacks/mpspecialraces/vehiclelayouts.meta |
| LAYOUT_LOW_ISSI7 | 2 | 2 | seat_dside_f seat_pside_f | 1 | issi7 | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_LOW_ITALIGTO | 2 | 2 | seat_dside_f seat_pside_f | 2 | italigto, stingertt | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_LOW_ITALIRSX | 2 | 2 | seat_dside_f seat_pside_f | 1 | italirsx | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_LOW_KRIEGER | 2 | 2 | seat_dside_f seat_pside_f | 1 | krieger | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_LOW_LAYOUT_LOW_COQUETTE5 | 2 | 2 | seat_dside_f seat_pside_f | 0 |  | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_LOW_LE7B | 2 | 2 | seat_dside_f seat_pside_f | 2 | le7b, tyrus | dlcpacks/mpstunt/vehiclelayouts.meta |
| LAYOUT_LOW_LM87 | 1 | 2 | seat_dside_f | 1 | lm87 | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_LOW_LOWRIDER | 2 | 2 | seat_dside_f seat_pside_f | 2 | buccaneer2, voodoo | dlcpacks/mplowrider/vehiclelayouts.meta |
| LAYOUT_LOW_LOWRIDER_FACTION | 2 | 2 | seat_dside_f seat_pside_f | 3 | faction, faction2, polfaction2 | dlcpacks/mplowrider/vehiclelayouts.meta |
| LAYOUT_LOW_LOWRIDER2 | 2 | 2 | seat_dside_f seat_pside_f | 2 | sabregt2, virgo2 | dlcpacks/mplowrider2/vehiclelayouts.meta |
| LAYOUT_LOW_LOWRIDER2_FACTION3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | faction3 | dlcpacks/mplowrider2/vehiclelayouts.meta |
| LAYOUT_LOW_LRCGT | 2 | 2 | seat_dside_f seat_pside_f | 1 | lrcgt | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_LOW_LUIVA | 2 | 2 | seat_dside_f seat_pside_f | 1 | luiva | dlcpacks/mp2025_02/vehiclelayouts.meta |
| LAYOUT_LOW_MICHELLI | 2 | 2 | seat_dside_f seat_pside_f | 1 | michelli | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_LOW_NEO | 2 | 2 | seat_dside_f seat_pside_f | 1 | neo | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_LOW_NIOBE | 2 | 2 | seat_dside_f seat_pside_f | 0 |  | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_LOW_OSIRIS | 2 | 2 | seat_dside_f seat_pside_f | 1 | osiris | dlcpacks/mpluxe/vehiclelayouts.meta |
| LAYOUT_LOW_PEYOTE2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | peyote2 | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_LOW_PEYOTE3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | peyote3 | dlcpacks/mpsum/vehiclelayouts.meta |
| LAYOUT_LOW_PIPISTRELLO | 2 | 2 | seat_dside_f seat_pside_f | 1 | pipistrello | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_LOW_PROTO | 2 | 2 | seat_dside_f seat_pside_f | 2 | prototipo, vagner | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_LOW_RACER_FORMULA | 1 | 2 | seat_dside_f | 4 | formula, formula2, openwheel1 | dlcpacks/mpheist3/vehiclelayouts_formula.meta |
| LAYOUT_LOW_RAPTOR | 2 | 2 | seat_dside_f seat_pside_f | 1 | raptor | dlcpacks/mpbiker/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED | 2 | 2 | seat_dside_f seat_pside_f | 47 | adder, astrale, bullet | common.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_DOMINATOR8 | 2 | 2 | seat_dside_f seat_pside_f | 2 | dominator8, driftdominator8 | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_EMERUS | 2 | 2 | seat_dside_f seat_pside_f | 1 | emerus | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_EUROS | 2 | 2 | seat_dside_f seat_pside_f | 4 | drifteuros, driftfr36, euros | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_GAUNTLET3 | 2 | 2 | seat_dside_f seat_pside_f | 3 | gauntlet3, gauntlet5, thrax | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_LOCUST | 2 | 2 | seat_dside_f seat_pside_f | 1 | locust | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_POSTLUDE | 2 | 2 | seat_dside_f seat_pside_f | 1 | postlude | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_RT3000 | 2 | 2 | seat_dside_f seat_pside_f | 2 | driftrt3000, rt3000 | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_SCHLAGEN | 2 | 2 | seat_dside_f seat_pside_f | 1 | schlagen | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_SCRAMJET | 2 | 2 | seat_dside_f seat_pside_f | 1 | scramjet | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_SWINGER | 2 | 2 | seat_dside_f seat_pside_f | 1 | swinger | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_LOW_RESTRICTED_TENF2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | tenf2 | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_LOW_RUINER2 | 2 | 2 | seat_dside_f seat_pside_f | 2 | ruiner2, ruiner3 | dlcpacks/mpimportexport/vehiclelayouts.meta |
| LAYOUT_LOW_RUSTON | 2 | 2 | seat_dside_f seat_pside_f | 2 | ardent, ruston | dlcpacks/mpspecialraces/vehiclelayouts.meta |
| LAYOUT_LOW_S80 | 1 | 2 | seat_dside_f | 1 | s80 | dlcpacks/mpvinewood/vehiclelayouts_s80.meta |
| LAYOUT_LOW_SC1 | 2 | 2 | seat_dside_f seat_pside_f | 2 | sc1, viseris | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_LOW_SENTINEL2 | 4 | 2 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | driftsentinel2, sentinel2 | update.rpf/vehiclelayouts.meta |
| LAYOUT_LOW_STROMBERG | 2 | 2 | seat_dside_f seat_pside_f | 1 | stromberg | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_LOW_SUZUME | 2 | 2 | seat_dside_f seat_pside_f | 1 | suzume | dlcpacks/mp2025_01/vehiclelayouts.meta |
| LAYOUT_LOW_TAIPAN | 2 | 2 | seat_dside_f seat_pside_f | 2 | entity2, taipan | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_LOW_TAMPA3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | tampa3 | dlcpacks/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_LOW_TEZERACT | 2 | 2 | seat_dside_f seat_pside_f | 2 | tezeract, tyrant | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_LOW_TIGON | 2 | 2 | seat_dside_f seat_pside_f | 1 | tigon | dlcpacks/mpsum/vehiclelayouts.meta |
| LAYOUT_LOW_TOREADOR | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | toreador | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_LOW_TORERO | 2 | 2 | seat_dside_f seat_pside_f | 2 | torero, xa21 | dlcpacks/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_LOW_TORERO2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | torero2 | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_LOW_TURISMOR | 2 | 2 | seat_dside_f seat_pside_f | 1 | turismor | x64w/dlcpacks/mpbusiness/vehiclelayouts.meta |
| LAYOUT_LOW_VAGRANT | 2 | 2 | seat_dside_f seat_pside_f | 1 | vagrant | dlcpacks/mpheist3/vehiclelayouts.meta |
| LAYOUT_LOW_VELENOGT | 2 | 2 | seat_dside_f seat_pside_f | 1 | velenogt | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_LOW_VERLIERER | 2 | 2 | seat_dside_f seat_pside_f | 2 | mamba, verlierer2 | dlcpacks/mpapartment/vehiclelayouts.meta |
| LAYOUT_LOW_VIGILANTE | 2 | 2 | seat_dside_f seat_pside_f | 1 | vigilante | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_LOW_VISIONE | 2 | 2 | seat_dside_f seat_pside_f | 1 | visione | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_LOW_WEEVIL2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | weevil2 | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_LOW_XTREME | 2 | 2 | seat_dside_f seat_pside_f | 1 | xtreme | dlcpacks/mp2025_02/vehiclelayouts.meta |
| LAYOUT_LOW_ZENO | 2 | 2 | seat_dside_f seat_pside_f | 1 | zeno | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_LOW_ZR350 | 2 | 2 | seat_dside_f seat_pside_f | 3 | driftzr350, previon, zr350 | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_MOWER | 1 | 2 | seat_dside_f | 2 | mower, tractor | common.rpf/vehiclelayouts.meta |
| LAYOUT_ONE_DOOR_VAN | 1 | 1 | seat_dside_f | 1 | taco | common.rpf/vehiclelayouts.meta |
| LAYOUT_PBUS2 | 11 | 5 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 seat_dside_r4 | 1 | pbus2 | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_PLANE_ALKONOST | 10 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 1 | alkonost | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_PLANE_ALPHA | 1 | 4 | seat_dside_f | 1 | alphaz1 | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_AVENGER | 3 | 5 | seat_dside_f seat_pside_f seat_dside_r | 4 | avenger, avenger2, avenger3 | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_PLANE_BESRA | 1 | 2 | seat_dside_f | 1 | besra | x64w/dlcpacks/mppilot/vehiclelayouts.meta |
| LAYOUT_PLANE_BOMBUSHKA | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r2 seat_pside_r2 seat_dside_r seat_pside_r | 1 | bombushka | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_CARGOPLANE2 | 5 | 5 | seat_dside_f seat_pside_f seat_dside_r seat_dside_r1 seat_dside_r2 | 1 | cargoplane2 | dlcpacks/mpchristmas3/vehiclelayouts.meta |
| LAYOUT_PLANE_CUBAN | 2 | 2 | seat_dside_f seat_pside_f | 1 | cuban800 | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_DUSTER | 2 | 4 | seat_pside_f seat_dside_f | 1 | duster | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_DUSTER2 | 1 | 2 | seat_dside_f | 1 | duster2 | dlcpacks/mp2024_02/vehiclelayouts.meta |
| LAYOUT_PLANE_HOWARD | 1 | 2 | seat_dside_f | 1 | howard | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_JET | 10 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 2 | luxor, shamal | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_JUMBO | 2 | 1 | seat_dside_f seat_pside_f | 1 | jet | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_LAZER | 1 | 2 | seat_dside_f | 3 | hydra, lazer, strikeforce | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_LUXOR2 | 8 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r1 seat_dside_r1 seat_pside_r seat_pside_r2 seat_pside_r3 | 1 | luxor2 | dlcpacks/mpluxe/vehiclelayouts.meta |
| LAYOUT_PLANE_MAMMATUS | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | mammatus | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_MICROLIGHT | 1 | 2 | seat_r | 1 | microlight | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_MILJET | 16 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 seat_dside_r4 seat_pside_r4 seat_dside_r5 seat_pside_r5 seat_dside_r6 seat_pside_r6 | 1 | miljet | x64w/dlcpacks/mppilot/vehiclelayouts.meta |
| LAYOUT_PLANE_MOGUL | 3 | 3 | seat_dside_f seat_pside_f seat_dside_r | 1 | mogul | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_MOLOTOK | 1 | 2 | seat_dside_f | 1 | molotok | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_NIMBUS | 8 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r1 seat_dside_r1 seat_pside_r seat_pside_r2 seat_pside_r3 | 1 | nimbus | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_PLANE_NOKOTA | 1 | 2 | seat_dside_f | 1 | nokota | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_PYRO | 2 | 2 | seat_dside_f seat_pside_f | 1 | pyro | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_RAIJU | 1 | 2 | seat_dside_f | 1 | raiju | dlcpacks/mp2023_01/vehiclelayouts.meta |
| LAYOUT_PLANE_ROGUE | 2 | 6 | seat_dside_f seat_pside_f | 1 | rogue | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_SEABREEZE | 2 | 2 | seat_dside_f seat_pside_f | 1 | seabreeze | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_SEAPLANE | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | dodo | x64w/dlcpacks/spupgrade/vehiclelayouts.meta |
| LAYOUT_PLANE_STARLING | 1 | 2 | seat_dside_f | 1 | starling | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_STREAMER | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | streamer216 | dlcpacks/mp2023_01/vehiclelayouts.meta |
| LAYOUT_PLANE_STUNT | 1 | 2 | seat_dside_f | 1 | stunt | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_TITAN | 10 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 1 | titan | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_TITAN2 | 16 | 7 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_pside_r1 seat_dside_r1 seat_pside_r2 seat_dside_r2 seat_pside_r3 seat_dside_r3 seat_pside_r4 seat_dside_r4 seat_pside_r5 seat_dside_r5 seat_pside_r6 seat_dside_r6 | 1 | titan2 | dlcpacks/mp2024_02/vehiclelayouts.meta |
| LAYOUT_PLANE_TULA | 5 | 10 | seat_dside_f seat_pside_f seat_dside_r2 seat_dside_r1 seat_pside_r1 | 1 | tula | dlcpacks/mpsmuggler/vehiclelayouts.meta |
| LAYOUT_PLANE_VELUM | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | velum, velum2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_PLANE_VELUM2 | 5 | 5 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r1 seat_pside_r | 0 |  | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_PLANE_VESTRA | 2 | 2 | seat_dside_f seat_pside_f | 1 | vestra | x64w/dlcpacks/mpbusiness/vehiclelayouts.meta |
| LAYOUT_PLANE_VOLATOL | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r2 seat_pside_r2 | 1 | volatol | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_PRISON_BUS | 11 | 5 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 seat_dside_r4 | 1 | pbus | common.rpf/vehiclelayouts.meta |
| LAYOUT_RANGER | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 14 | cavalcade, cavalcade2, cavalcade3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_RANGER_CARACARA | 5 | 7 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 | 1 | caracara | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_RANGER_CARACARA2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | caracara2, polcaracara | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_RANGER_CARACARA3 | 5 | 7 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 | 1 | caracara3 | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_RANGER_EVERON | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | everon | dlcpacks/mpheist3/vehiclelayouts.meta |
| LAYOUT_RANGER_JUBILEE | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | jubilee | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_RANGER_NOVAK | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | novak | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_RANGER_PATRIOT2 | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_dside_r3 | 1 | patriot2 | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_RANGER_REBLA | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | rebla | dlcpacks/mpheist3/vehiclelayouts.meta |
| LAYOUT_RANGER_RIATA | 2 | 2 | seat_dside_f seat_pside_f | 1 | riata | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_RANGER_SANDKING | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | sandking, sandking2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_RANGER_SEMINOLE2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | seminole2 | dlcpacks/mpsum/vehiclelayouts.meta |
| LAYOUT_RANGER_SWAT | 8 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 | 4 | fbi2, granger, pranger | update.rpf/vehiclelayouts.meta |
| LAYOUT_RANGER_TOROS | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | toros | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_RCTANK | 1 | 2 | seat_dside_f | 1 | minitank | dlcpacks/mpheist3/vehiclelayouts.meta |
| LAYOUT_RIOT_VAN | 8 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 | 4 | riot, stockade, stockade3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_SLAMTRUCK | 2 | 2 | seat_dside_f seat_pside_f | 1 | slamtruck | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_SQUADDIE | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | squaddie | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_STANDARD | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 84 | asbo, asea, asea2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_STANDARD_BUFFALO4 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | buffalo4 | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_STANDARD_SENTINEL4 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | driftsentinel, sentinel4 | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_STANDARD_SULTAN3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | sultan3 | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_STD_ALEUTIAN | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | aleutian | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_ARENA_1HONLY | 2 | 2 | seat_dside_f seat_pside_f | 9 | dominator4, dominator5, dominator6 | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_STD_ASTEROPE2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | asterope2 | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_ASTRON | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | astron | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_STD_ASTRON2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | astron2 | dlcpacks/mpg9ec/vehiclelayouts.meta |
| LAYOUT_STD_BALLER4 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 4 | baller3, baller4, baller5 | dlcpacks/mpapartment/vehiclelayouts.meta |
| LAYOUT_STD_BALLER8 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | baller8 | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_BARRAGE | 4 | 6 | seat_dside_f seat_pside_f seat_pside_r seat_dside_r | 1 | barrage | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_STD_BASIC | 2 | 2 | seat_dside_f seat_pside_f | 1 | kalahari | x64w/dlcpacks/mpbeach/vehiclelayouts.meta |
| LAYOUT_STD_BLISTA2 | 2 | 2 | seat_dside_f seat_pside_f | 2 | blista2, blista3 | x64w/dlcpacks/spupgrade/vehiclelayouts.meta |
| LAYOUT_STD_BOOR | 2 | 2 | seat_dside_f seat_pside_f | 1 | boor | dlcpacks/mpchristmas3/vehiclelayouts.meta |
| LAYOUT_STD_BRAWLER | 2 | 2 | seat_dside_f seat_pside_f | 1 | brawler | dlcpacks/mpluxe2/vehiclelayouts.meta |
| LAYOUT_STD_BRIGHAM | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | brigham | dlcpacks/mp2023_01/vehiclelayouts.meta |
| LAYOUT_STD_BRIOSO | 2 | 2 | seat_dside_f seat_pside_f | 1 | brioso | dlcpacks/mpstunt/vehiclelayouts.meta |
| LAYOUT_STD_BRUISER | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | bruiser, bruiser2, bruiser3 | dlcpacks/mpchristmas2018/vehiclelayouts_bruiser.meta |
| LAYOUT_STD_CASTIGATOR | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | castigator | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_STD_CHINO | 2 | 2 | seat_dside_f seat_pside_f | 1 | chino | dlcpacks/mpluxe2/vehiclelayouts.meta |
| LAYOUT_STD_CINQUEMILA | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | cinquemila | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_STD_CLIQUE | 2 | 2 | seat_dside_f seat_pside_f | 1 | clique | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_STD_COQUETTE2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | coquette2 | x64w/dlcpacks/mppilot/vehiclelayouts.meta |
| LAYOUT_STD_COUREUR | 2 | 2 | seat_dside_f seat_pside_f | 1 | coureur | dlcpacks/mp2023_01/vehiclelayouts.meta |
| LAYOUT_STD_CYPHER | 2 | 2 | seat_dside_f seat_pside_f | 2 | cypher, driftcypher | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_STD_DEITY | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | deity | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_STD_DEVIANT | 2 | 2 | seat_dside_f seat_pside_f | 1 | deviant | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_STD_DOMINATOR10 | 2 | 2 | seat_dside_f seat_pside_f | 3 | dominator10, driftdominator10, poldominator10 | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_STD_DOMINATOR9 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | dominator9, driftdominator9, vigero3 | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_DORADO | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | dorado, poldorado | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_DRAFTER | 2 | 2 | seat_dside_f seat_pside_f | 1 | drafter | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_STD_DRAUGUR | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | draugur | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_STD_DRIFTJESTER3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | driftjester3 | dlcpacks/mp2024_02/vehiclelayouts.meta |
| LAYOUT_STD_DYNASTY | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | dynasty, jugular | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_STD_ENVISAGE | 2 | 2 | seat_dside_f seat_pside_f | 1 | envisage | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_STD_ESTRIDE | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | estride | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_STD_EVERON3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | everon3 | dlcpacks/mp2025_01/vehiclelayouts.meta |
| LAYOUT_STD_EXITFIXUP | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 25 | alpha, chavosv6, cog55 | common.rpf/vehiclelayouts.meta |
| LAYOUT_STD_FIREBOLT | 2 | 2 | seat_dside_f seat_pside_f | 1 | firebolt | dlcpacks/mp2024_02/vehiclelayouts.meta |
| LAYOUT_STD_GRANGER2 | 8 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 | 1 | granger2 | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_STD_GREENWOOD | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | greenwood, impaler6, polgreenwood | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_STD_HABANERO | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 4 | cognoscenti, cognoscenti2, habanero | common.rpf/vehiclelayouts.meta |
| LAYOUT_STD_HIGHWINDOW | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 16 | baller, baller2, baller7 | common.rpf/vehiclelayouts.meta |
| LAYOUT_STD_HOTRING | 2 | 2 | seat_dside_f seat_pside_f | 3 | everon2, gauntlet6, hotring | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_STD_HUNTLEY | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | huntley | x64w/dlcpacks/mpbusiness2/vehiclelayouts.meta |
| LAYOUT_STD_HUSTLER | 2 | 2 | seat_dside_f seat_pside_f | 1 | hustler | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_STD_IMPALER5 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | impaler5, polimpaler5 | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_ISSI3 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 5 | brioso2, brioso3, cheburek | dlcpacks/mpassault/vehiclelayouts.meta |
| LAYOUT_STD_ISSI4 | 2 | 2 | seat_dside_f seat_pside_f | 3 | issi4, issi5, issi6 | dlcpacks/mpchristmas2018/vehiclelayouts_issi4.meta |
| LAYOUT_STD_ISSI8 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | issi8 | dlcpacks/mpchristmas3/vehiclelayouts.meta |
| LAYOUT_STD_I-WAGEN | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | iwagen | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_STD_KURUMA | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 0 |  | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_STD_KURUMA2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | kuruma2 | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_STD_L35 | 2 | 2 | seat_dside_f seat_pside_f | 3 | driftl352, l35, l352 | dlcpacks/mp2023_01/vehiclelayouts.meta |
| LAYOUT_STD_LIMOTURRET | 5 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r4 | 1 | limo2 | dlcpacks/mpapartment/vehiclelayouts.meta |
| LAYOUT_STD_LOWRIDER | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | primo2 | dlcpacks/mplowrider/vehiclelayouts.meta |
| LAYOUT_STD_LOWRIDER_CHINO | 2 | 2 | seat_dside_f seat_pside_f | 1 | chino2 | dlcpacks/mplowrider/vehiclelayouts.meta |
| LAYOUT_STD_LOWRIDER_SIDEDOOR | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | moonbeam, moonbeam2 | dlcpacks/mplowrider/vehiclelayouts.meta |
| LAYOUT_STD_LOWRIDER2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | glendale2, tornado5 | dlcpacks/mplowrider2/vehiclelayouts.meta |
| LAYOUT_STD_LOWRIDER2_SIDEDOOR | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | minivan2 | dlcpacks/mplowrider2/vehiclelayouts.meta |
| LAYOUT_STD_LOWRIDER2_SLAMVAN | 2 | 2 | seat_dside_f seat_pside_f | 4 | driftyosemite, slamvan3, yosemite | dlcpacks/mplowrider2/vehiclelayouts.meta |
| LAYOUT_STD_LOWROOF | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | blista, fugitive, jackal | common.rpf/vehiclelayouts.meta |
| LAYOUT_STD_MERULA | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | merula | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_STD_NEON | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | neon, raiden | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_STD_OMNIS | 2 | 2 | seat_dside_f seat_pside_f | 1 | omnis | dlcpacks/mpstunt/vehiclelayouts.meta |
| LAYOUT_STD_OUTLAW | 2 | 2 | seat_dside_f seat_pside_f | 1 | outlaw | dlcpacks/mpheist3/vehiclelayouts.meta |
| LAYOUT_STD_PANTO | 2 | 2 | seat_dside_f seat_pside_f | 1 | panto | x64w/dlcpacks/mphipster/vehiclelayouts.meta |
| LAYOUT_STD_PARAGON | 2 | 2 | seat_dside_f seat_pside_f | 3 | paragon, paragon2, paragon3 | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_STD_PATRIOT3 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | patriot3 | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_STD_POLBUFFALO6 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | polbuffalo6 | dlcpacks/mp2025_02/vehiclelayouts.meta |
| LAYOUT_STD_POLGAUNTLET | 2 | 2 | seat_dside_f seat_pside_f | 1 | polgauntlet | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_POLIMPALER6 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | polimpaler6 | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_STD_POLTERMINUS | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | polterminus | dlcpacks/mp2024_02/vehiclelayouts.meta |
| LAYOUT_STD_RATEL | 2 | 2 | seat_dside_f seat_pside_f | 1 | ratel | dlcpacks/mp2023_01/vehiclelayouts.meta |
| LAYOUT_STD_RHINEHART | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | rhinehart | dlcpacks/mpsum2/vehiclelayouts.meta |
| LAYOUT_STD_RIPLEY | 2 | 2 | seat_dside_f seat_pside_f | 5 | ratloader, ratloader2, ripley | common.rpf/vehiclelayouts.meta |
| LAYOUT_STD_S95 | 2 | 2 | seat_dside_f seat_pside_f | 1 | s95 | dlcpacks/mpg9ec/vehiclelayouts.meta |
| LAYOUT_STD_SENTINEL5 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | sentinel5 | dlcpacks/mp2025_01/vehiclelayouts.meta |
| LAYOUT_STD_SENTINEL6 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | sentinel6 | dlcpacks/mp2025_02/vehiclelayouts.meta |
| LAYOUT_STD_SLAMVAN4 | 2 | 2 | seat_dside_f seat_pside_f | 3 | slamvan4, slamvan5, slamvan6 | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_STD_STRATUM | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | stratum | common.rpf/vehiclelayouts.meta |
| LAYOUT_STD_STRETCH | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_dside_r3 | 1 | stretch | common.rpf/vehiclelayouts.meta |
| LAYOUT_STD_TAHOMA | 2 | 2 | seat_dside_f seat_pside_f | 1 | tahoma | dlcpacks/mpchristmas3/vehiclelayouts.meta |
| LAYOUT_STD_TAMPA4 | 2 | 2 | seat_dside_f seat_pside_f | 1 | tampa4 | dlcpacks/mp2025_01/vehiclelayouts.meta |
| LAYOUT_STD_TECHNICAL | 3 | 5 | seat_dside_f seat_pside_f seat_dside_r | 1 | technical | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_STD_TECHNICAL_AQUA | 3 | 4 | seat_dside_f seat_pside_f seat_dside_r | 1 | technical2 | dlcpacks/mpimportexport/vehiclelayouts.meta |
| LAYOUT_STD_TECHNICAL3 | 3 | 5 | seat_dside_f seat_pside_f seat_dside_r | 1 | technical3 | dlc_patch/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_STD_TERMINUS | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | terminus | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_STD_TROPHY | 2 | 2 | seat_dside_f seat_pside_f | 2 | trophytruck, trophytruck2 | dlcpacks/mpstunt/vehiclelayouts.meta |
| LAYOUT_STD_WARDEN | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | warden | dlcpacks/mp2026_01/vehiclelayouts.meta |
| LAYOUT_STD_WARRENER | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | warrener | x64w/dlcpacks/mphipster/vehiclelayouts.meta |
| LAYOUT_STD_WARRENER2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | warrener2 | dlcpacks/mptuner/vehiclelayouts.meta |
| LAYOUT_STD_WEEVIL | 2 | 2 | seat_dside_f seat_pside_f | 1 | weevil | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_STD_WINDSOR2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | windsor2 | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_STD_XLS | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | xls, xls2 | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_STD_YOSEMITE3 | 2 | 2 | seat_dside_f seat_pside_f | 2 | yosemite1500, yosemite3 | dlcpacks/mpsum/vehiclelayouts.meta |
| LAYOUT_STD_ZION3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | zion3 | dlcpacks/mpvinewood/vehiclelayouts.meta |
| LAYOUT_STD_ZTYPE | 2 | 2 | seat_dside_f seat_pside_f | 1 | ztype | common.rpf/vehiclelayouts.meta |
| LAYOUT_TANK | 2 | 2 | seat_dside_f seat_pside_f | 1 | rhino | common.rpf/vehiclelayouts.meta |
| LAYOUT_TANK_APC | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | apc | dlcpacks/mpgunrunning/vehiclelayouts_apc.meta |
| LAYOUT_TANK_KHANJALI | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | khanjali | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_TANK_SCARAB | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | scarab, scarab2, scarab3 | dlcpacks/mpchristmas2018/vehiclelayouts_scarab.meta |
| LAYOUT_TOURBUS | 10 | 6 | seat_dside_f seat_pside_f seat_dside_r1 seat_pside_r seat_dside_r seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 2 | rentalbus, tourbus | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRACTOR2 | 1 | 2 | seat_dside_f | 2 | tractor2, tractor3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRAILER_AA | 1 | 3 | seat_dside_r | 1 | trailersmall2 | dlcpacks/mpgunrunning/vehiclelayouts_trailer.meta |
| LAYOUT_TRAILER_MOBILEOPS | 3 | 1 | seat_a seat_b seat_c | 1 | trailerlarge | dlcpacks/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_TRAIN | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 10 | cablecar, freight, freightcar | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRAIN_FREIGHT2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | freight2 | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_TRUCK | 2 | 2 | seat_dside_f seat_pside_f | 34 | armytanker, armytrailer, armytrailer2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRUCK_BARRACKS | 10 | 10 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 2 | barracks, barracks3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRUCK_BIFF | 2 | 2 | seat_dside_f seat_pside_f | 2 | biff, tiptruck2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRUCK_BRICKADE | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 | 2 | brickade, brickade2 | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_TRUCK_CERBERUS | 2 | 2 | seat_dside_f seat_pside_f | 3 | cerberus, cerberus2, cerberus3 | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_TRUCK_CHERNOBOG | 2 | 3 | seat_dside_f seat_dside_r | 1 | chernobog | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_TRUCK_DOCKTUG | 1 | 1 | seat_dside_f | 1 | docktug | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRUCK_FLATBED2 | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 1 | flatbed2 | dlcpacks/mp2025_01/vehiclelayouts.meta |
| LAYOUT_TRUCK_GUARDIAN | 6 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_pside_r2 | 1 | guardian | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_TRUCK_HAULER2 | 2 | 2 | seat_dside_f seat_pside_f | 1 | hauler2 | dlcpacks/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_TRUCK_MARSHALL | 2 | 2 | seat_dside_f seat_pside_f | 1 | marshall | x64w/dlcpacks/spupgrade/vehiclelayouts.meta |
| LAYOUT_TRUCK_MIXER | 2 | 2 | seat_dside_f seat_pside_f | 2 | mixer, tiptruck | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRUCK_MONSTER | 2 | 2 | seat_dside_f seat_pside_f | 1 | monster | x64w/dlcpacks/mpindependence/vehiclelayouts.meta |
| LAYOUT_TRUCK_MONSTER3 | 2 | 2 | seat_dside_f seat_pside_f | 3 | monster3, monster4, monster5 | dlcpacks/mpchristmas2018/vehiclelayouts_monster3.meta |
| LAYOUT_TRUCK_PHANTOMBULL | 5 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 | 2 | phantom2, phantom3 | dlcpacks/mpimportexport/vehiclelayouts_phantombull.meta |
| LAYOUT_TRUCK_POUNDER2 | 8 | 8 | seat_dside_f seat_pside_f seat_dside_r seat_dside_r1 seat_dside_r2 seat_pside_r seat_pside_r1 seat_pside_r2 | 1 | pounder2 | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_TRUCK_TERBYTE | 2 | 2 | seat_dside_f seat_pside_f | 1 | terbyte | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_TRUCK_TOW | 2 | 2 | seat_dside_f seat_pside_f | 5 | mixer2, scrap, towtruck | common.rpf/vehiclelayouts.meta |
| LAYOUT_TRUCK_VETIR | 10 | 10 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 seat_dside_r2 seat_pside_r2 seat_dside_r3 seat_pside_r3 | 1 | vetir | dlcpacks/mpheist4/vehiclelayouts.meta |
| LAYOUT_TRUCK_WASTELANDER | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_pside_r1 | 1 | wastelander | dlcpacks/mpimportexport/vehiclelayouts_wastelander.meta |
| LAYOUT_UNKNOWN | 2 | 2 | seat_dside_f seat_pside_f | 2 | tr2, tr4 | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 20 | ambulance, burrito, burrito2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_APOCOLYPSE | 5 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r4 | 1 | boxville5 | dlcpacks/mpimportexport/vehiclelayouts.meta |
| LAYOUT_VAN_ARMORED | 9 | 12 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r3 seat_pside_r3 seat_dside_r2 seat_pside_r2 seat_dside_r4 | 3 | insurgent, insurgent2, insurgent3 | dlcpacks/mpheist/vehiclelayouts_insurgent.meta |
| LAYOUT_VAN_BODHI | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | bodhi2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_BOXVILLE | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 5 | boxville, boxville2, boxville3 | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_BRUTUS | 2 | 2 | seat_dside_f seat_pside_f | 3 | brutus, brutus2, brutus3 | dlcpacks/mpchristmas2018/vehiclelayouts.meta |
| LAYOUT_VAN_CADDY | 2 | 2 | seat_dside_f seat_pside_f | 3 | airtug, caddy, caddy2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_CADDY3 | 2 | 2 | seat_dside_f seat_pside_f | 1 | caddy3 | dlcpacks/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_VAN_FRANKEN | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | btype2 | dlcpacks/mphalloween/vehiclelayouts.meta |
| LAYOUT_VAN_FREECRAWLER | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | freecrawler | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_VAN_HALFTRACK | 3 | 5 | seat_dside_f seat_pside_f seat_dside_r | 1 | halftrack | dlcpacks/mpgunrunning/vehiclelayouts_halftrack.meta |
| LAYOUT_VAN_JOURNEY | 6 | 3 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 1 | journey | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_JOURNEY2 | 6 | 3 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 1 | journey2 | dlcpacks/mpchristmas3/vehiclelayouts.meta |
| LAYOUT_VAN_KEITORA | 2 | 2 | seat_dside_f seat_pside_f | 2 | driftkeitora, keitora | dlcpacks/mp2025_02/vehiclelayouts.meta |
| LAYOUT_VAN_MENACER | 5 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 | 1 | menacer | dlcpacks/mpbattle/vehiclelayouts_menacer.meta |
| LAYOUT_VAN_MULE | 6 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 7 | benson, benson2, mule | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_MULE4 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r1 seat_pside_r1 | 1 | mule4 | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_VAN_MULE5 | 6 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r3 seat_pside_r3 | 1 | mule5 | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_VAN_NIGHTSHARK | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | nightshark | dlcpacks/mpgunrunning/vehiclelayouts.meta |
| LAYOUT_VAN_POLICE | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | policet | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_POLICET3 | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 1 | policet3 | dlcpacks/mp2024_01/vehiclelayouts.meta |
| LAYOUT_VAN_PONY | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | pony | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_RIOT2 | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r1 seat_pside_r1 | 1 | riot2 | dlcpacks/mpchristmas2017/vehiclelayouts.meta |
| LAYOUT_VAN_ROOSEVELT | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_pside_r2 | 1 | btype | x64w/dlcpacks/mpvalentines/vehiclelayouts.meta |
| LAYOUT_VAN_ROOSEVELT2 | 6 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r seat_dside_r2 seat_pside_r2 | 1 | btype3 | dlcpacks/mpvalentines2/vehiclelayouts.meta |
| LAYOUT_VAN_RUMPO3 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | rumpo3 | dlcpacks/mpexecutive/vehiclelayouts.meta |
| LAYOUT_VAN_SLAMVAN | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | slamvan2 | dlcpacks/mpheist/vehiclelayouts.meta |
| LAYOUT_VAN_SPEEDO4 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 2 | speedo4, speedo5 | dlcpacks/mpbattle/vehiclelayouts.meta |
| LAYOUT_VAN_TRASH | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r1 seat_pside_r1 | 3 | dloader, trash, trash2 | common.rpf/vehiclelayouts.meta |
| LAYOUT_VAN_VIVANITE | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | laufer, vivanite, vivanite2 | dlcpacks/mp2023_02/vehiclelayouts.meta |
| LAYOUT_VAN_YOUGA2 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | youga2 | dlcpacks/mpbiker/vehiclelayouts.meta |
| LAYOUT_VAN_YOUGA3 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | youga3 | dlcpacks/mpsum/vehiclelayouts.meta |
| LAYOUT_VAN_YOUGA4 | 4 | 4 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 3 | surfer3, youga4, youga5 | dlcpacks/mpsecurity/vehiclelayouts.meta |
| LAYOUT_VAN_ZHABA | 4 | 6 | seat_dside_f seat_pside_f seat_dside_r seat_pside_r | 1 | zhaba | dlcpacks/mpheist3/vehiclelayouts_zhaba.meta |
| LAYOUT_VETO | 1 | 2 | seat_dside_f | 2 | veto, veto2 | dlcpacks/mpheist4/vehiclelayouts.meta |

