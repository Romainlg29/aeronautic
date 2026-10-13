import { describe, expect, it } from "vitest";
import { air_column, CLIMATES, field_salts, make_climate } from "./climate";
import { diagnose, prepare } from "./diagnose";
import { bolt, random } from "./lightning";
import { patch, storm } from "./plugin";
import { Weather } from "./weather";

// The air over a line of points, a kilometre apart
const transect = (weather: Weather, count: number, step_m = 1000) =>
  Array.from({ length: count }, (_, i) => {
    const column = weather.column(i * step_m, 0);

    return { ...column };
  });

describe("the climate's air", () => {
  const salts = field_salts(7);

  it("is the same for the same seed, place and time", () => {
    const a = air_column(CLIMATES.fair, salts, 12_000, -4_000, 600);
    const b = air_column(CLIMATES.fair, field_salts(7), 12_000, -4_000, 600);

    expect(a).toEqual(b);
  });

  it("is different from place to place: never one sky everywhere", () => {
    const humidities = new Set<number>();

    for (let i = 0; i < 40; i++) {
      humidities.add(
        Math.round(
          air_column(CLIMATES.fair, salts, i * 5_000, 0, 0).humidity * 100,
        ),
      );
    }

    expect(humidities.size).toBeGreaterThan(8);
  });

  it("changes as time goes", () => {
    const now = air_column(CLIMATES.fair, salts, 0, 0, 0).humidity;
    const later = air_column(
      CLIMATES.fair,
      salts,
      0,
      0,
      CLIMATES.fair.evolutionS * 2,
    ).humidity;

    expect(later).not.toBeCloseTo(now, 3);
  });

  it("is different for another seed", () => {
    expect(air_column(CLIMATES.fair, field_salts(8), 0, 0, 0)).not.toEqual(
      air_column(CLIMATES.fair, salts, 0, 0, 0),
    );
  });

  it("takes changes field by field", () => {
    const climate = make_climate("fair", {
      fields: { humidity: { mean: 0.9 } },
    });

    expect(climate.fields.humidity.mean).toBe(0.9);
    expect(climate.fields.humidity.local).toBe(
      CLIMATES.fair.fields.humidity.local,
    );
  });
});

describe("the clouds over a column", () => {
  const prepared = prepare(CLIMATES.fair);
  const air = {
    humidity: 0.7,
    warmthK: 1.5,
    capM: 2500,
    midHumidity: 0.3,
    highHumidity: 0.3,
    liftMPerS: 0,
  };

  it("has its base where the parcel saturates, higher in drier air", () => {
    const humid = diagnose(prepared, { ...air, humidity: 0.85 });
    const dry = { ...diagnose(prepared, { ...air, humidity: 0.55 }) };

    expect(dry.baseM).toBeGreaterThan(humid.baseM);
  });

  it("has no cumulus without warmth to lift them", () => {
    expect(diagnose(prepared, { ...air, warmthK: 0 }).cumulus).toBe(0);
  });

  it("has them grow no higher than the inversion", () => {
    const column = diagnose(prepared, { ...air, capM: 1500 });

    expect(column.cumulusTopM).toBeLessThanOrEqual(
      CLIMATES.fair.groundM + 1500 + 1e-6,
    );
  });

  it("has its shares of the sky between none and all", () => {
    const column = diagnose(prepared, air);

    for (const share of [
      column.cumulus,
      column.stratus,
      column.alto,
      column.cirrus,
    ]) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });
});

describe("the weather", () => {
  it("has clouds in some places and not in others", () => {
    const weather = new Weather({ climate: "fair", seed: 3 });
    const covers = transect(weather, 200, 2000).map((c) => c.cumulus);

    expect(Math.max(...covers)).toBeGreaterThan(0.1);
    expect(Math.min(...covers)).toBeLessThan(Math.max(...covers) * 0.5);
  });

  it("is clear in a clear climate, and covered in an overcast one", () => {
    const mean = (name: "clear" | "overcast") => {
      const weather = new Weather({ climate: name, seed: 3 });
      const columns = transect(weather, 50, 3000);

      return (
        columns.reduce(
          (sum, c) => sum + Math.max(c.cumulus, c.stratus, c.alto),
          0,
        ) / columns.length
      );
    };

    expect(mean("overcast")).toBeGreaterThan(mean("clear"));
  });

  it("is dense in a cloud and clear under it", () => {
    const weather = new Weather({ climate: "overcast", seed: 1 });
    let found = false;

    for (let x = 0; x < 50_000 && !found; x += 500) {
      const column = weather.column(x, 0);

      if (column.stratus < 0.5) continue;

      const middle = (column.baseM + column.stratusTopM) / 2;
      const under = weather.sample(
        x,
        column.baseM - 300 - weather.origin[1],
        0,
      );

      for (let dy = -100; dy <= 100 && !found; dy += 10) {
        const inside = weather.sample(x, middle + dy - weather.origin[1], 0);

        if (inside.inCloud) {
          found = true;
          expect(inside.visibilityM).toBeLessThan(2000);
        }
      }

      expect(under.inCloud).toBe(false);
    }

    expect(found).toBe(true);
  });

  it("drifts its clouds with the wind", () => {
    const weather = new Weather({ climate: "fair", seed: 5 });
    const [wx, wz] = weather.climate.wind;
    const before = weather.column(0, 0).cumulus;

    weather.time = 100;

    expect(weather.column(wx * 100, wz * 100).cumulus).toBeCloseTo(before, 1);
  });

  it("is moister in a moist patch", () => {
    const weather = new Weather({ climate: "fair", seed: 2 });
    const dry = weather.air(0, 0).humidity;
    const remove = weather.use(
      patch({ at: [0, 0], radiusM: 10_000, change: { humidity: 0.2 } }),
    );

    expect(weather.air(0, 0).humidity).toBeGreaterThan(dry);

    remove();

    expect(weather.air(0, 0).humidity).toBeCloseTo(dry, 6);
  });

  it("rains and flashes under a storm", () => {
    const weather = new Weather({ climate: "unsettled", seed: 4 });
    const flashes: unknown[] = [];

    weather.use(storm({ at: [0, 0] }));
    weather.on("flash", (flash) => flashes.push(flash));

    for (let i = 0; i < 600; i++) weather.advance(0.1);

    const [x, z] = weather.to_scene(0, 0, 0);
    const column = weather.column(x, z);

    expect(weather.cells.length).toBeGreaterThan(0);
    expect(column.rainMmPerH).toBeGreaterThan(1);
    expect(column.cumulusTopM).toBeGreaterThan(8000);
    expect(flashes.length).toBeGreaterThan(0);
  });

  it("rains downshear of a storm's tower, its wall cloud under it", () => {
    const weather = new Weather({ climate: "unsettled", seed: 4 });

    weather.use(storm({ at: [0, 0] }));

    for (let i = 0; i < 100; i++) weather.advance(0.1);

    const [cell] = weather.cells;
    const { upperWind, wind } = weather.climate;
    const [tx, tz] = weather.to_scene(0, 0, 0);
    const [rx, rz] = weather.to_scene(cell.rainX, 0, cell.rainZ);
    const tower = { ...weather.column(tx, tz) };
    const rain = weather.column(rx, rz);

    // Carried some kilometres the way the wind grows with height
    const along =
      cell.rainX * (upperWind[0] - wind[0]) +
      cell.rainZ * (upperWind[1] - wind[1]);

    expect(along).toBeGreaterThan(0);
    expect(Math.hypot(cell.rainX, cell.rainZ)).toBeGreaterThan(2000);
    expect(Math.hypot(cell.rainX, cell.rainZ)).toBeLessThan(10_000);
    expect(rain.rainMmPerH).toBeGreaterThan(tower.rainMmPerH * 5);

    // A wall cloud a few hundred metres under the rest of the base
    expect(rain.baseM - tower.baseM).toBeGreaterThan(150);
    expect(rain.baseM - tower.baseM).toBeLessThan(700);
  });
});

describe("each climate", () => {
  // Over a line of 400 km, as the survey of each day's sky
  const survey = (name: keyof typeof CLIMATES) => {
    const weather = new Weather({ climate: name, seed: 1 });
    let cumulus = 0;
    let deck = 0;
    let rain = 0;

    for (let i = 0; i < 160; i++) {
      const column = weather.column(i * 2500, (i % 20) * 7000);

      cumulus += column.cumulus / 160;
      deck += column.stratus / 160;
      rain = Math.max(rain, column.rainMmPerH);
    }

    return { cumulus, deck, rain };
  };

  it("covers a fair day's sky with a tenth to a third of cumulus (Neggers et al. 2003)", () => {
    const { cumulus, deck } = survey("fair");

    expect(cumulus).toBeGreaterThan(0.1);
    expect(cumulus).toBeLessThan(0.3);
    expect(deck).toBeLessThan(0.05);
  });

  it("keeps a clear day clear", () => {
    const { cumulus, deck } = survey("clear");

    expect(cumulus + deck).toBeLessThan(0.05);
  });

  it("decks an overcast day, drizzling at most", () => {
    const { deck, rain } = survey("overcast");

    expect(deck).toBeGreaterThan(0.7);
    expect(rain).toBeLessThan(2);
  });

  it("showers on an unsettled day, short of a cloudburst", () => {
    const { rain } = survey("unsettled");

    expect(rain).toBeGreaterThan(2);
    expect(rain).toBeLessThan(100);
  });
});

describe("a lightning channel", () => {
  it("never goes under the ground, its branches neither", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { points } = bolt([0, 5000, 0], [800, 0, 300], random(seed), 0);

      for (let i = 1; i < points.length; i += 3) {
        expect(points[i]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
