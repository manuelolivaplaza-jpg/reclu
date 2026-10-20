import { describe, expect, it } from "vitest";
import {
  API_DATASET_SLUGS,
  API_DEFAULT_PER_PAGE,
  API_MAX_PER_PAGE,
  EXCLUDED_API_DATASET_SLUGS,
  getApiDataset,
  isExcludedDataset,
  paginationMeta,
  parsePagination,
} from "@/lib/api-datasets";
import { GET } from "@/app/api/v1/[dataset]/route";

const EXCLUDED = ["house_ptr", "senate_ptr", "oge_278t", "nport_subversive"];

const PUBLIC = [
  "afp",
  "corredoras",
  "infoprobidad",
  "dividendos",
  "hechos",
  "insiders",
];

describe("lista blanca de datasets", () => {
  it("publica solo las seis fuentes chilenas aprobadas", () => {
    expect([...API_DATASET_SLUGS].sort()).toEqual([...PUBLIC].sort());
  });

  it("excluye las declaraciones de funcionarios de EE.UU.", () => {
    expect([...EXCLUDED_API_DATASET_SLUGS].sort()).toEqual([...EXCLUDED].sort());
    for (const slug of EXCLUDED) {
      expect(getApiDataset(slug)).toBeNull();
      expect(isExcludedDataset(slug)).toBe(true);
      expect(API_DATASET_SLUGS).not.toContain(slug);
    }
  });

  it("respeta mayúsculas y slugs inventados", () => {
    expect(getApiDataset("afp")?.slug).toBe("afp");
    expect(getApiDataset("AFP")).toBeNull();
    expect(getApiDataset("")).toBeNull();
    expect(getApiDataset(null)).toBeNull();
    expect(isExcludedDataset("OTRO")).toBe(false);
  });

  it("InfoProbidad se publica como agregado con CC BY 4.0", () => {
    const dataset = getApiDataset("infoprobidad");
    expect(dataset?.license).toBe("CC BY 4.0");
    expect(dataset?.attribution).toContain("Consejo para la Transparencia");
    expect(dataset?.description.toLowerCase()).toContain("sin datos personales");
  });
});

describe("GET /api/v1/[dataset] con datasets excluidos", () => {
  it.each(EXCLUDED)("%s devuelve 404 sin autenticar", async (slug) => {
    const response = await GET(new Request(`https://reclu.cl/api/v1/${slug}`), {
      params: Promise.resolve({ dataset: slug }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: "Dataset no encontrado.",
      status: 404,
    });
  });

  it("un dataset inventado también devuelve 404", async () => {
    const response = await GET(new Request("https://reclu.cl/api/v1/otro"), {
      params: Promise.resolve({ dataset: "otro" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("parsePagination", () => {
  it("usa page=1 y 50 por defecto", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({
      page: 1,
      perPage: API_DEFAULT_PER_PAGE,
      from: 0,
      to: API_DEFAULT_PER_PAGE - 1,
    });
  });

  it("lee page y per_page", () => {
    expect(parsePagination(new URLSearchParams("page=3&per_page=20"))).toEqual({
      page: 3,
      perPage: 20,
      from: 40,
      to: 59,
    });
  });

  it("acota el tamaño de página y nunca acepta valores inválidos", () => {
    expect(
      parsePagination(new URLSearchParams("per_page=999")).perPage,
    ).toBe(API_MAX_PER_PAGE);
    expect(parsePagination(new URLSearchParams("page=0")).page).toBe(1);
    expect(parsePagination(new URLSearchParams("page=-2")).page).toBe(1);
    expect(
      parsePagination(new URLSearchParams("per_page=abc")).perPage,
    ).toBe(API_DEFAULT_PER_PAGE);
  });

  it("acepta offset/limit como alias", () => {
    expect(
      parsePagination(new URLSearchParams("offset=100&limit=25")),
    ).toEqual({ page: 5, perPage: 25, from: 100, to: 124 });
  });
});

describe("paginationMeta", () => {
  it("calcula totales y si hay más páginas", () => {
    expect(
      paginationMeta({ page: 1, perPage: 50, from: 0 }, 120),
    ).toEqual({ page: 1, per_page: 50, total: 120, total_pages: 3, has_more: true });
    expect(
      paginationMeta({ page: 3, perPage: 50, from: 100 }, 120),
    ).toEqual({ page: 3, per_page: 50, total: 120, total_pages: 3, has_more: false });
  });

  it("una lista vacía tiene cero páginas", () => {
    expect(
      paginationMeta({ page: 1, perPage: 50, from: 0 }, 0),
    ).toMatchObject({ total: 0, total_pages: 0, has_more: false });
  });
});
