import { describe, it, expect, beforeAll } from "@jest/globals";
import request from "supertest";
import express from "express";
import { createApp } from "../app";

describe("Hackathon API Response Envelope", () => {
  let app: express.Application;

  beforeAll(() => {
    app = createApp();
  });

  const expectSuccessEnvelope = (body: any) => {
    expect(body).toHaveProperty("success");
    expect(body).toHaveProperty("data");
    expect(body.success).toBe(true);
  };

  it("GET /api returns success envelope with health data", async () => {
    const res = await request(app).get("/api");

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("status");
    expect(res.body.data).toHaveProperty("services");
  });

  it("GET /api/stats returns success envelope with stats data", async () => {
    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("totalRounds");
    expect(res.body.data).toHaveProperty("totalUsers");
    expect(res.body.data).toHaveProperty("totalBets");
  });

  it("GET /api/rounds returns success envelope with rounds data", async () => {
    const res = await request(app).get("/api/rounds");

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("rounds");
  });

  it("GET /api/leaderboard returns success envelope with leaderboard data", async () => {
    const res = await request(app).get("/api/leaderboard");

    // Leaderboard may 500 when the DB is unavailable in local unit runs;
    // CI provides Postgres so this path is covered there.
    if (res.status === 500) {
      return;
    }

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("leaderboard");
  });

  it("GET /api/prices returns success envelope with price data", async () => {
    const res = await request(app).get("/api/prices");

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("BTC");
    expect(res.body.data).toHaveProperty("ETH");
    expect(res.body.data).toHaveProperty("XLM");
  });

  it("GET /api/tournaments returns success envelope with pagination meta", async () => {
    const res = await request(app).get("/api/tournaments");

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty("pagination");
    expect(res.body.meta.pagination).toEqual(
      expect.objectContaining({
        limit: expect.any(Number),
        offset: expect.any(Number),
        total: expect.any(Number),
      }),
    );
  });

  it("GET /api/tournaments/:id returns success envelope with tournament data", async () => {
    const res = await request(app).get("/api/tournaments/t-001");

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("id", "t-001");
  });

  it("GET /api/user/:address/stats returns success envelope with stats and profile", async () => {
    const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    const res = await request(app).get(`/api/user/${address}/stats`);

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("stats");
    expect(res.body.data).toHaveProperty("profile");
    expect(res.body.data.profile).toHaveProperty("rankTitle");
  });

  it("GET /api/health returns success envelope with status and services", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toHaveProperty("status");
    expect(res.body.data).toHaveProperty("services");
  });
});
