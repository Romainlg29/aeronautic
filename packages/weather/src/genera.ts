import type { CloudLayer } from "./types";

// The clouds, as the WMO's International Cloud Atlas names them
//
// Each genus is a layer with the dials set as that cloud is observed. Its
// étage sets its base: the low clouds' at the condensation level, the middle
// clouds' at 2 to 7 km and the high clouds' at 5 to 13 km in the temperate
// latitudes. The rest, by source:
//
// - Sizes: cumulus diameters fall off as a power law, about D^-2 in the trade
//   cumulus Benner and Curry (1998) measured from Landsat; the smallest a
//   hundred metres or so, the largest a few kilometres, more for a congestus.
// - Shapes: the Atlas's own words. A humilis "of only a slight vertical
//   extent", flatter than it is wide; a mediocris about as tall as it is wide;
//   a congestus "markedly vertical", taller; a cumulonimbus up to the
//   tropopause, where it spreads into an anvil tens of kilometres across and
//   a couple thick.
// - Water: the share of the adiabatic water a cloud keeps, its adiabatic
//   fraction, near 0.8 in stratocumulus (Albrecht et al. 1990) and falling
//   with height in cumulus as they entrain dry air, to a third or less in
//   deep convection (Warner 1955).
// - Updrafts: one to three metres a second in fair-weather cumulus, five to
//   ten in a congestus, ten to thirty in a thunderstorm.
// - Rain: a thunderstorm's core rains tens of millimetres an hour; a
//   nimbostratus a few, steadily.
// - Ice: crystals of 40 to 60 µm in generalised effective size in cirrus and
//   anvils, Fu's (1996) mid-range.
// - Wind: as it typically blows over the mid-latitudes, a few metres a second
//   near the ground and tens at the jet's height.
//
// - Domes: a thermal's top is near a spherical cap (Scorer 1957), so a
//   tower's is a half ellipsoid, as wide as it and as tall as its aspect has
//   it: a crown of 2.
// - Billows: a cumulus rises as a train of thermals each about half its
//   width (Blyth, Cooper and Jensen 1988; Damiani, Vali and Haimov 2006), so
//   its bubbles' radius is a quarter of the largest tower's diameter.
//
// The detail's size, and a sheet's cells, are estimates: the detail a tenth
// to a fifth of a turret, by eye in photographs, and a sheet's cells a few
// times its thickness

/** The genera, and the cumulus's species */
export type CloudGenus =
  | "cumulus-humilis"
  | "cumulus-mediocris"
  | "cumulus-congestus"
  | "cumulonimbus"
  | "stratocumulus"
  | "stratus"
  | "nimbostratus"
  | "altocumulus"
  | "altostratus"
  | "cirrus"
  | "cirrostratus";

// What every layer shares unless its genus says otherwise
const BASE: CloudLayer = {
  form: "cumuliform",
  baseM: "condensation",
  depthM: 1000,
  cover: 0.3,
  diameterM: [150, 1500],
  sizeExponent: 2,
  aspect: 0.5,
  crown: 2,
  rainMmPerH: 0,
  adiabaticFraction: 0.6,
  airMass: "continental",
  iceSizeM: 50e-6,
  updraftMPerS: 2,
  billowM: 200,
  detailM: 40,
  stretch: 1,
  windMPerS: [5, 0],
};

const GENERA: Record<CloudGenus, Partial<CloudLayer>> = {
  "cumulus-humilis": {
    depthM: 800,
    cover: 0.25,
    diameterM: [150, 1500],
    aspect: 0.4,
    adiabaticFraction: 0.6,
    updraftMPerS: 1.5,
    billowM: 375,
    detailM: 30,
  },
  "cumulus-mediocris": {
    depthM: 2500,
    cover: 0.35,
    diameterM: [200, 2500],
    aspect: 0.9,
    adiabaticFraction: 0.5,
    updraftMPerS: 3,
    billowM: 625,
    detailM: 50,
  },
  "cumulus-congestus": {
    depthM: 6000,
    cover: 0.3,
    diameterM: [500, 5000],
    aspect: 1.6,
    adiabaticFraction: 0.4,
    updraftMPerS: 8,
    billowM: 1250,
    detailM: 80,
  },
  cumulonimbus: {
    depthM: "tropopause",
    cover: 0.1,
    diameterM: [4000, 12_000],
    aspect: 1.2,
    anvil: { diameterM: 40_000, thicknessM: 2000, drift: 0.5 },
    rainMmPerH: 40,
    adiabaticFraction: 0.3,
    iceSizeM: 40e-6,
    updraftMPerS: 20,
    billowM: 3000,
    detailM: 150,
    windMPerS: [10, 0],
  },
  stratocumulus: {
    form: "stratiform",
    depthM: 400,
    cover: 0.8,
    diameterM: [2000, 2000],
    adiabaticFraction: 0.8,
    airMass: "maritime",
    updraftMPerS: 0.5,
    billowM: 500,
    detailM: 60,
  },
  stratus: {
    form: "stratiform",
    depthM: 300,
    cover: 1,
    diameterM: [8000, 8000],
    adiabaticFraction: 0.9,
    updraftMPerS: 0.1,
    billowM: 1200,
    detailM: 100,
    windMPerS: [3, 0],
  },
  nimbostratus: {
    form: "stratiform",
    depthM: 3000,
    cover: 1,
    diameterM: [20_000, 20_000],
    rainMmPerH: 3,
    adiabaticFraction: 0.8,
    iceSizeM: 60e-6,
    updraftMPerS: 0.2,
    billowM: 2000,
    detailM: 150,
    windMPerS: [10, 0],
  },
  altocumulus: {
    form: "stratiform",
    baseM: 3500,
    depthM: 400,
    cover: 0.5,
    diameterM: [1500, 1500],
    adiabaticFraction: 0.7,
    updraftMPerS: 0.5,
    billowM: 250,
    detailM: 40,
    windMPerS: [12, 0],
  },
  altostratus: {
    form: "stratiform",
    baseM: 4000,
    depthM: 1500,
    cover: 1,
    diameterM: [15_000, 15_000],
    adiabaticFraction: 0.6,
    iceSizeM: 60e-6,
    updraftMPerS: 0.1,
    billowM: 2500,
    detailM: 200,
    windMPerS: [15, 0],
  },
  cirrus: {
    form: "stratiform",
    baseM: 8000,
    depthM: 1500,
    cover: 0.3,
    diameterM: [6000, 6000],
    adiabaticFraction: 0.3,
    iceSizeM: 50e-6,
    updraftMPerS: 0.3,
    billowM: 1500,
    detailM: 150,
    stretch: 4,
    windMPerS: [25, 0],
  },
  cirrostratus: {
    form: "stratiform",
    baseM: 9000,
    depthM: 800,
    cover: 1,
    diameterM: [20_000, 20_000],
    adiabaticFraction: 0.2,
    iceSizeM: 50e-6,
    updraftMPerS: 0.1,
    billowM: 3000,
    detailM: 300,
    stretch: 2,
    windMPerS: [25, 0],
  },
};

/** Every genus, in the Atlas's order, low to high */
export const CLOUD_GENERA = Object.keys(GENERA) as CloudGenus[];

/**
 * A layer of one genus, its dials as observed, any of them overridden.
 * @param genus What cloud
 * @param overrides The dials to set otherwise
 * @returns A fresh layer
 */
export const cloud_layer = (
  genus: CloudGenus,
  overrides: Partial<CloudLayer> = {},
): CloudLayer => ({ ...BASE, ...GENERA[genus], ...overrides });
