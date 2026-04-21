import { Router } from "express";
import leagueBaseRoutes from "./league-base.js";
import leagueDraftRoutes from "./league-draft.js";
import leagueTransactionRoutes from "./league-transactions.js";

const router = Router();

router.use(leagueBaseRoutes);
router.use(leagueDraftRoutes);
router.use(leagueTransactionRoutes);

export default router;
