---
title: The genera
description: "Every genus's dials, and where each number comes from."
---

The genera are the WMO's International Cloud Atlas's, the cumulus split into
its species. Every genus is a [layer](/docs/weather/reference/layer) with its
dials set as that cloud is observed; any of them can be changed.

## The low clouds

Their base is the day's condensation level.

| genus               | depth      | cover | diameters      | aspect | adiabatic fraction | updraft | rain    | billows |
| ------------------- | ---------- | ----- | -------------- | ------ | ------------------ | ------- | ------- | ------- |
| `cumulus-humilis`   | 800 m      | 0.25  | 150 m – 1.5 km | 0.4    | 0.6                | 1.5 m/s |         | 375 m   |
| `cumulus-mediocris` | 2.5 km     | 0.35  | 200 m – 2.5 km | 0.9    | 0.5                | 3 m/s   |         | 625 m   |
| `cumulus-congestus` | 6 km       | 0.3   | 500 m – 5 km   | 1.6    | 0.4                | 8 m/s   |         | 1.25 km |
| `cumulonimbus`      | tropopause | 0.1   | 4 – 12 km      | 1.2    | 0.3                | 20 m/s  | 40 mm/h | 3 km    |
| `stratocumulus`     | 400 m      | 0.8   | cells 2 km     |        | 0.8, maritime      | 0.5 m/s |         | 500 m   |
| `stratus`           | 300 m      | 1     | cells 8 km     |        | 0.9                | 0.1 m/s |         | 1.2 km  |
| `nimbostratus`      | 3 km       | 1     | cells 20 km    |        | 0.8                | 0.2 m/s | 3 mm/h  | 2 km    |

The cumulonimbus's anvil is 40 km across and 2 km thick under the
tropopause, carried half its radius downwind.

## The middle and high clouds

| genus          | base   | depth  | cover | cells  | ice size | wind   | stretch |
| -------------- | ------ | ------ | ----- | ------ | -------- | ------ | ------- |
| `altocumulus`  | 3.5 km | 400 m  | 0.5   | 1.5 km | 50 µm    | 12 m/s | 1       |
| `altostratus`  | 4 km   | 1.5 km | 1     | 15 km  | 60 µm    | 15 m/s | 1       |
| `cirrus`       | 8 km   | 1.5 km | 0.3   | 6 km   | 50 µm    | 25 m/s | 4       |
| `cirrostratus` | 9 km   | 800 m  | 1     | 20 km  | 50 µm    | 25 m/s | 2       |

## Where they come from

- **Bases**: the low clouds' at the condensation level; the middle clouds'
  at 2 to 7 km and the high clouds' at 5 to 13 km in the temperate
  latitudes, as the Atlas puts them.
- **Sizes**: cumulus diameters fall off as a power law, about D<sup>−2</sup>,
  in the trade cumulus Benner and Curry (1998) measured from Landsat.
- **Shapes**: the Atlas's own words. A humilis "of only a slight vertical
  extent", a mediocris about as tall as wide, a congestus "markedly
  vertical", a cumulonimbus up to the tropopause, where it spreads into an
  anvil tens of kilometres across.
- **Domes**: a thermal's top is near a spherical cap (Scorer 1957), so a
  tower's is a half ellipsoid: a crown of 2.
- **Billows**: a cumulus rises as a train of thermals each about half its
  width (Blyth, Cooper and Jensen 1988; Damiani, Vali and Haimov 2006), so a
  billow's radius is a quarter of the largest tower's diameter.
- **Water**: the adiabatic fraction is near 0.8 in stratocumulus (Albrecht
  et al. 1990), falling with height in cumulus as they entrain dry air, to
  a third or less in deep convection (Warner 1955).
- **Updrafts**: 1 to 3 m/s in fair-weather cumulus, 5 to 10 in a congestus,
  10 to 30 in a thunderstorm.
- **Rain**: a thunderstorm's core rains tens of millimetres an hour, a
  nimbostratus a few, steadily.
- **Ice**: crystals of 40 to 60 µm in generalised effective size in cirrus
  and anvils, the middle of Fu's (1996) range.
- **Wind**: as it typically blows over the mid-latitudes, a few metres a
  second near the ground and tens near the jet.

Estimates: the detail's size, a tenth to a fifth of a turret by eye in
photographs, and a sheet's cells, a few times its thickness.
