import { Router, type IRouter } from "express";
import healthRouter from "./health";
import banksRouter from "./banks";
import jobsRouter from "./jobs";
import statsRouter from "./stats";
import shareRouter from "./share";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/banks", banksRouter);
router.use("/jobs", jobsRouter);
router.use("/stats", statsRouter);
router.use(shareRouter);

export default router;
