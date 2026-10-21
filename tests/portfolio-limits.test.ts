import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLANS,
  NEWS_RELATIONS_BY_DEPTH,
  canAddPositions,
  newsRelationsFor,
  portfolioLimitsFor,
} from "@/lib/plans";
import { isMyPortfolioEnabled, isNewsImpactEnabled } from "@/lib/portfolio-flags";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const TRIAL_ACTIVE = "2026-10-23T12:00:00Z";
const TRIAL_EXPIRED = "2026-10-10T12:00:00Z";

describe("límites de Mi portafolio por plan", () => {
  it("Gratis: 10 posiciones, manual + CSV, noticias directas con 24 h", () => {
    const limits = portfolioLimitsFor("free");
    expect(limits).toMatchObject({
      plan: "free",
      maxPositions: 10,
      importSources: ["manual", "csv"],
      newsDepth: "direct",
      newsDelayHours: 24,
      newsRelations: ["direct"],
      autoAlerts: "none",
      autoAlertsMaxPerDay: 0,
      exportCsv: false,
    });
  });

  it("Pro: 50 posiciones, agrega cartola, directas + sector al día", () => {
    const limits = portfolioLimitsFor("pro");
    expect(limits).toMatchObject({
      plan: "pro",
      maxPositions: 50,
      importSources: ["manual", "csv", "cartola"],
      newsDepth: "direct_sector",
      newsDelayHours: 0,
      newsRelations: ["direct", "sector"],
      autoAlerts: "daily_digest",
      autoAlertsMaxPerDay: 1,
      exportCsv: false,
    });
  });

  it("Elite: 200 posiciones, cartola multi, todo el feed, tiempo real y CSV", () => {
    const limits = portfolioLimitsFor("elite");
    expect(limits).toMatchObject({
      plan: "elite",
      maxPositions: 200,
      importSources: ["manual", "csv", "cartola", "cartola_multi"],
      newsDepth: "all",
      newsDelayHours: 0,
      newsRelations: ["direct", "sector", "supplier", "competitor", "macro"],
      autoAlerts: "realtime",
      autoAlertsMaxPerDay: 20,
      exportCsv: true,
    });
  });

  it("los mismos números viven en PlanConfig", () => {
    expect(PLANS.free.portfolioMaxPositions).toBe(10);
    expect(PLANS.pro.portfolioMaxPositions).toBe(50);
    expect(PLANS.elite.portfolioMaxPositions).toBe(200);
    expect(PLANS.free.portfolioExportCsv).toBe(false);
    expect(PLANS.pro.portfolioExportCsv).toBe(false);
    expect(PLANS.elite.portfolioExportCsv).toBe(true);
  });

  it("un plan desconocido cae a Gratis", () => {
    expect(portfolioLimitsFor("noexiste").plan).toBe("free");
    expect(portfolioLimitsFor(null).maxPositions).toBe(10);
    expect(portfolioLimitsFor(undefined).exportCsv).toBe(false);
  });

  it("la prueba vigente usa los límites Pro y al vencer vuelve a Gratis", () => {
    const trial = portfolioLimitsFor("free", TRIAL_ACTIVE, NOW);
    expect(trial.plan).toBe("pro");
    expect(trial.maxPositions).toBe(50);
    expect(trial.importSources).toContain("cartola");
    expect(trial.newsDelayHours).toBe(0);
    expect(trial.autoAlerts).toBe("daily_digest");

    const expired = portfolioLimitsFor("free", TRIAL_EXPIRED, NOW);
    expect(expired.plan).toBe("free");
    expect(expired.maxPositions).toBe(10);
  });

  it("la prueba no degrada a un plan pagado", () => {
    expect(portfolioLimitsFor("elite", TRIAL_ACTIVE, NOW).plan).toBe("elite");
    expect(portfolioLimitsFor("elite", TRIAL_ACTIVE, NOW).maxPositions).toBe(200);
  });

  it("devuelve copias: mutar el resultado no toca la configuración", () => {
    const limits = portfolioLimitsFor("free");
    limits.importSources.push("cartola_multi");
    limits.newsRelations.push("macro");
    expect(PLANS.free.portfolioImport).toEqual(["manual", "csv"]);
    expect(NEWS_RELATIONS_BY_DEPTH.direct).toEqual(["direct"]);
  });
});

describe("canAddPositions", () => {
  it("respeta el borde exacto de cada plan", () => {
    expect(canAddPositions("free", 0, 10)).toBe(true);
    expect(canAddPositions("free", 9, 1)).toBe(true);
    expect(canAddPositions("free", 10, 1)).toBe(false);
    expect(canAddPositions("free", 5, 6)).toBe(false);

    expect(canAddPositions("pro", 49, 1)).toBe(true);
    expect(canAddPositions("pro", 50, 1)).toBe(false);

    expect(canAddPositions("elite", 199, 1)).toBe(true);
    expect(canAddPositions("elite", 200, 1)).toBe(false);
    expect(canAddPositions("elite", 0, 200)).toBe(true);
  });

  it("la prueba vigente permite hasta 50 posiciones", () => {
    expect(canAddPositions("free", 49, 1, TRIAL_ACTIVE, NOW)).toBe(true);
    expect(canAddPositions("free", 50, 1, TRIAL_ACTIVE, NOW)).toBe(false);
    expect(canAddPositions("free", 10, 1, TRIAL_EXPIRED, NOW)).toBe(false);
  });

  it("un plan desconocido usa el tope de Gratis", () => {
    expect(canAddPositions("noexiste", 9, 1)).toBe(true);
    expect(canAddPositions("noexiste", 10, 1)).toBe(false);
  });

  it("normaliza valores inválidos o negativos a 0", () => {
    expect(canAddPositions("free", -5, 10)).toBe(true);
    expect(canAddPositions("free", -5, 11)).toBe(false);
    expect(canAddPositions("free", Number.NaN, Number.NaN)).toBe(true);
    expect(canAddPositions("free", 2.9, 7.9)).toBe(true);
    expect(canAddPositions("free", 3, 8)).toBe(false);
  });
});

describe("newsRelationsFor", () => {
  it("crece por plan: directa → +sector → +proveedores/competidores/macro", () => {
    expect(newsRelationsFor("free")).toEqual(["direct"]);
    expect(newsRelationsFor("pro")).toEqual(["direct", "sector"]);
    expect(newsRelationsFor("elite")).toEqual([
      "direct",
      "sector",
      "supplier",
      "competitor",
      "macro",
    ]);
  });

  it("la prueba vigente y el vencimiento siguen al plan efectivo", () => {
    expect(newsRelationsFor("free", TRIAL_ACTIVE, NOW)).toEqual(["direct", "sector"]);
    expect(newsRelationsFor("free", TRIAL_EXPIRED, NOW)).toEqual(["direct"]);
  });

  it("devuelve un arreglo nuevo en cada llamada", () => {
    const first = newsRelationsFor("free");
    first.push("macro");
    expect(newsRelationsFor("free")).toEqual(["direct"]);
  });
});

describe("flags de Mi portafolio e impacto de noticias", () => {
  const ORIGINAL_PORTFOLIO = process.env.MY_PORTFOLIO_ENABLED;
  const ORIGINAL_NEWS = process.env.NEWS_IMPACT_ENABLED;

  beforeEach(() => {
    delete process.env.MY_PORTFOLIO_ENABLED;
    delete process.env.NEWS_IMPACT_ENABLED;
  });

  afterEach(() => {
    if (ORIGINAL_PORTFOLIO === undefined) delete process.env.MY_PORTFOLIO_ENABLED;
    else process.env.MY_PORTFOLIO_ENABLED = ORIGINAL_PORTFOLIO;
    if (ORIGINAL_NEWS === undefined) delete process.env.NEWS_IMPACT_ENABLED;
    else process.env.NEWS_IMPACT_ENABLED = ORIGINAL_NEWS;
  });

  it("están apagados sin variable o con valores parecidos", () => {
    expect(isMyPortfolioEnabled()).toBe(false);
    expect(isNewsImpactEnabled()).toBe(false);

    for (const value of ["1", "TRUE", "True", "yes", " true", "true "]) {
      process.env.MY_PORTFOLIO_ENABLED = value;
      process.env.NEWS_IMPACT_ENABLED = value;
      expect(isMyPortfolioEnabled(), `MY_PORTFOLIO_ENABLED=${value}`).toBe(false);
      expect(isNewsImpactEnabled(), `NEWS_IMPACT_ENABLED=${value}`).toBe(false);
    }
  });

  it("solo el valor exacto \"true\" los enciende", () => {
    process.env.MY_PORTFOLIO_ENABLED = "true";
    process.env.NEWS_IMPACT_ENABLED = "true";
    expect(isMyPortfolioEnabled()).toBe(true);
    expect(isNewsImpactEnabled()).toBe(true);
  });
});
