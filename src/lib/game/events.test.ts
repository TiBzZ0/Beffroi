import { describe, expect, it } from "vitest";
import { drawNextEvent, tourneyPodium } from "./events";

describe("tourneyPodium", () => {
  it("classe le plus fort premier et ne donne pas de podium à un inscrit seul", () => {
    const strong = { chevalier: 10 };
    const weak = { milicien: 2 };
    const p = tourneyPodium({ a: strong, b: weak, c: weak, d: weak }, 7);
    expect(p[0]).toBe("a");
    expect(p).toHaveLength(3);
    expect(new Set(p).size).toBe(3);
    expect(tourneyPodium({ a: strong }, 1)).toEqual(["a"]);
    expect(tourneyPodium({ a: strong, b: weak }, 3)).toEqual(["a", "b"]);
  });
  it("est déterministe", () => {
    const e = { a: { piquier: 5 }, b: { piquier: 5 }, c: { piquier: 5 }, d: { piquier: 5 }, e: { piquier: 5 } };
    expect(tourneyPodium(e, 42)).toEqual(tourneyPodium(e, 42));
  });
});

describe("drawNextEvent", () => {
  it("alterne colosse et tournoi", () => {
    expect(drawNextEvent("colosse", 5)).toBe("tournoi");
    expect(drawNextEvent("tournoi", 5)).toBe("colosse");
  });
  it("garde le colosse quand il n'y a pas assez de monde pour un tournoi", () => {
    expect(drawNextEvent("colosse", 1)).toBe("colosse");
  });
  it("après un événement d'une ancienne saison, commence par le colosse", () => {
    expect(drawNextEvent("caravane", 10)).toBe("colosse");
  });
});
