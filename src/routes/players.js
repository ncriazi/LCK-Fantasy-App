import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const players = await prisma.lckPlayer.findMany({
      orderBy: [{ teamName: "asc" }, { name: "asc" }],
    });

    res.json(players);
  } catch (error) {
    console.error("Failed to fetch players:", error);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

export default router;
