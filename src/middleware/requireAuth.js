import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token is required" });
    }

    const token = authHeader.slice("Bearer ".length);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found for this token" });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Authentication failed:", error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
