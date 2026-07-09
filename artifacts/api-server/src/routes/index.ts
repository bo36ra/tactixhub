import { Router, type IRouter } from "express";
import healthRouter from "./health";
import teamsRouter from "./teams";
import playersRouter from "./players";
import matchesRouter from "./matches";
import attendanceRouter from "./attendance";
import goalsRouter from "./goals";
import cardsRouter from "./cards";
import playingTimeRouter from "./playing-time";
import dashboardRouter from "./dashboard";
import lineupsRouter from "./lineups";

const router: IRouter = Router();

router.use(healthRouter);
router.use(teamsRouter);
router.use(playersRouter);
router.use(matchesRouter);
router.use(attendanceRouter);
router.use(goalsRouter);
router.use(cardsRouter);
router.use(playingTimeRouter);
router.use(dashboardRouter);
router.use(lineupsRouter);

export default router;
