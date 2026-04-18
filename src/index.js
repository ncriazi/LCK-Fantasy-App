import "dotenv/config";
import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth.js";
import healthRoutes from "./routes/health.js";
import leagueRoutes from "./routes/leagues.js";
import playerRoutes from "./routes/players.js";
import teamRoutes from "./routes/teams.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/health", healthRoutes);
app.use("/leagues", leagueRoutes);
app.use("/players", playerRoutes);
app.use("/teams", teamRoutes);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
