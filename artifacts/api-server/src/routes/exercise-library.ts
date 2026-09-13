import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, exerciseLibraryTable, teamsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { verifyProTeam } from "../lib/teamAccess";
import { dbErrorMessage } from "../lib/dbError";

const router = Router();

function guarded(handler: (req: any, res: any, teamId: number) => Promise<void>) {
  return async (req: any, res: any) => {
    const teamId = parseInt(req.params.teamId as string);
    if (!(await verifyProTeam(req.userId as string, teamId))) {
      res.status(403).json({ error: "pro_required" });
      return;
    }
    try {
      await handler(req, res, teamId);
    } catch (err) {
      req.log.error({ err }, "exercise library route failed");
      res.status(500).json({ error: dbErrorMessage(err) });
    }
  };
}

const CATEGORIES = ["warm_up", "possession", "finishing", "defending", "set_piece", "conditioning", "small_sided_game", "cool_down", "other"];
const MAX_IMAGE_LENGTH = 900_000;

function sanitizeImage(image: unknown): string | null {
  if (typeof image !== "string" || !image) return null;
  if (!image.startsWith("data:image/") || image.length > MAX_IMAGE_LENGTH) return null;
  return image;
}
function cleanMinutes(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 300) : null;
}

// Original starter library — written from general, long-established
// football coaching concepts (rondos, possession squares, finishing
// patterns, defensive shape work), not sourced or copied from any
// specific drill library or coaching platform. Seeded once per team
// the first time their (empty) library is requested — see the GET
// route below — so every team that becomes Pro starts with the same
// baseline set instead of an empty screen, without needing a separate
// "on upgrade" hook to exist first.
const STARTER_EXERCISES: Array<{
  title: string; category: string; objectiveOffense: string | null; objectiveDefense: string | null;
  space: string | null; playersFormat: string | null; minutes: number | null; explanation: string;
}> = [
  {
    title: "تسخين ديناميكي بالكرة", category: "warm_up",
    objectiveOffense: "تحضير اللاعبين حركياً مع لمسة كرة مستمرة", objectiveDefense: null,
    space: "نصف الملعب", playersFormat: "كل لاعب مع كرة", minutes: 10,
    explanation: "يجري اللاعبون بحرية داخل المساحة المحددة ومعهم كرة، يبدّلون بين الجري الأمامي والخلفي والجانبي، ثم يضيف المدرب لمسات تحكم بسيطة (لمسة واحدة، قلب الكرة، سحب الكرة) كل 30 ثانية تقريباً.",
  },
  {
    title: "رونديه تسخين صغير", category: "warm_up",
    objectiveOffense: "سرعة تمرير الكرة والتواصل البصري قبل الحصة الرئيسية", objectiveDefense: null,
    space: "مربع 8×8 متر", playersFormat: "4 ضد 1 أو 5 ضد 2", minutes: 8,
    explanation: "مجموعة صغيرة تحافظ على الاستحواذ داخل مساحة ضيقة ضد لاعب أو لاعبين بالمنتصف، بلمسة واحدة أو لمستين كحد أقصى.",
  },
  {
    title: "استحواذ 4 ضد 4 مع دعم محايد", category: "possession",
    objectiveOffense: "الحفاظ على الكرة تحت ضغط والبحث عن المساحات", objectiveDefense: "الضغط الجماعي لاستعادة الكرة",
    space: "20×15 متر", playersFormat: "4 ضد 4 + لاعبان محايدان", minutes: 12,
    explanation: "فريقان من 4 لاعبين يتنافسان على الاستحواذ، مع لاعبين محايدين يلعبان دائماً مع من يملك الكرة لخلق تفوق عددي 6 ضد 4. الهدف تحقيق عدد معين من التمريرات المتتالية قبل فقدان الكرة.",
  },
  {
    title: "استحواذ بأربع مناطق", category: "possession",
    objectiveOffense: "تحريك الكرة بين مناطق الملعب وتبديل نقطة الهجوم", objectiveDefense: "تضييق المساحة حسب منطقة الكرة",
    space: "الملعب مقسم لأربع مناطق متساوية", playersFormat: "8 ضد 8 (أو حسب العدد المتاح)", minutes: 15,
    explanation: "يجب على الفريق المستحوذ تحريك الكرة بين المناطق الأربع بترتيب معين قبل محاولة إنهاء الهجمة، يشجع على الاتساع وتبديل جهة اللعب.",
  },
  {
    title: "إنهاء من العرضيات الجانبية", category: "finishing",
    objectiveOffense: "التموضع الصحيح داخل منطقة الجزاء لاستقبال العرضية", objectiveDefense: null,
    space: "ثلث الملعب الهجومي", playersFormat: "لاعبان بالأطراف + 3 مهاجمين + حارس", minutes: 15,
    explanation: "يرسل اللاعبون الجانبيون كرات عرضية متنوعة (أرضية، عالية، خلف خط الدفاع) بينما يتناوب المهاجمون على الجري داخل منطقة الجزاء بتوقيت مختلف لإنهاء الكرات بالرأس أو القدم.",
  },
  {
    title: "تسديد سريع تحت ضغط", category: "finishing",
    objectiveOffense: "التحكم والتسديد السريع خلال لمستين كحد أقصى", objectiveDefense: null,
    space: "منطقة الجزاء وما حولها", playersFormat: "فردي أو أزواج", minutes: 10,
    explanation: "يستقبل اللاعب تمريرة من زاوية مختلفة في كل مرة (من الخلف، الجانب، الأمام) ويجب عليه التحكم والتسديد سريعاً، مع مدافع خفيف الضغط لمحاكاة ضغط المباراة الحقيقي.",
  },
  {
    title: "دفاع 1 ضد 1 بالعرض", category: "defending",
    objectiveOffense: null, objectiveDefense: "تأخير المهاجم وتوجيهه نحو الخط الجانبي",
    space: "10×10 متر", playersFormat: "1 ضد 1", minutes: 10,
    explanation: "يبدأ المهاجم بالكرة من المنتصف، والهدف الدفاعي تأخير التقدم وتوجيه المهاجم بعيداً عن المرمى دون تدخل متسرع، مع التركيز على وضعية الجسم وخطوات القدمين.",
  },
  {
    title: "تنظيم خط الدفاع المرتفع", category: "defending",
    objectiveOffense: null, objectiveDefense: "الحفاظ على خط دفاعي مستقيم والتقدم/التراجع الجماعي",
    space: "نصف الملعب", playersFormat: "4 مدافعين ضد 3-4 مهاجمين", minutes: 15,
    explanation: "يتدرب خط الدفاع على التحرك ككتلة واحدة صعوداً ونزولاً حسب موقع الكرة، مع التركيز على تنفيذ فخ التسلل بتوقيت جماعي عند تمرير الكرة للخلف من المهاجمين.",
  },
  {
    title: "ركلة ركنية قصيرة ومناورة", category: "set_piece",
    objectiveOffense: "خلق مساحة للتسديد أو العرضية الثانية بتوقيت جماعي", objectiveDefense: null,
    space: "منطقة الجزاء وحولها", playersFormat: "حسب التشكيلة الأساسية", minutes: 10,
    explanation: "يتدرب الفريق على تنويعة ركنية قصيرة (تمريرة قصيرة للاعب القريب) تليها مناورة تبديل مواقع، مع التركيز على التوقيت بين اللاعبين.",
  },
  {
    title: "دفاع الركلات الحرة الجانبية", category: "set_piece",
    objectiveOffense: null, objectiveDefense: "تغطية المناطق الخطرة وتحديد المسؤوليات بوضوح",
    space: "منطقة الجزاء", playersFormat: "حسب التشكيلة الأساسية", minutes: 10,
    explanation: "يتدرب الفريق على نظام دفاعي مختلط (رجل لرجل + تغطية مناطق) ضد الركلات الحرة الجانبية، مع تحديد لاعب مسؤول عن كل عمود ومن يغطي العارضة.",
  },
  {
    title: "تكرارات سريعة بالكرة", category: "conditioning",
    objectiveOffense: "الجمع بين السرعة والتحكم بالكرة تحت التعب", objectiveDefense: null,
    space: "30×20 متر", playersFormat: "فردي", minutes: 12,
    explanation: "سلسلة تكرارات من الجري السريع لمسافة 20-30 متر مع الكرة، بفترات راحة قصيرة بينها، تحاكي متطلبات اللياقة الخاصة بكرة القدم بدلاً من الجري الصرف.",
  },
  {
    title: "لعبة مصغرة بمرميين صغيرين", category: "small_sided_game",
    objectiveOffense: "اتخاذ القرار السريع والمبادرة الفردية", objectiveDefense: "الضغط المبكر لاستعادة الكرة",
    space: "30×20 متر", playersFormat: "5 ضد 5 بدون حراس", minutes: 15,
    explanation: "مباراة مصغرة بمرميين صغيرين، يمكن إضافة قيود مثل \"لمستين كحد أقصى\" لتحسين سرعة اللعب واتخاذ القرار.",
  },
  {
    title: "لعبة انتقال سريع (هجوم-دفاع)", category: "small_sided_game",
    objectiveOffense: "استغلال اللحظة الأولى بعد استعادة الكرة", objectiveDefense: "الضغط الفوري خلال 5 ثوانٍ بعد فقدان الكرة",
    space: "ملعب متوسط", playersFormat: "7 ضد 7", minutes: 18,
    explanation: "تركز على التحول السريع بين الهجوم والدفاع لحظة فقدان أو استعادة الكرة، بمجرد الفقدان يجب الضغط الفوري لاستعادتها قبل تنظيم الخصم لهجمته.",
  },
  {
    title: "تهدئة واستطالة", category: "cool_down",
    objectiveOffense: null, objectiveDefense: null,
    space: "أي مكان", playersFormat: null, minutes: 8,
    explanation: "مشي خفيف لتقليل معدل ضربات القلب تدريجياً، متبوع بتمارين استطالة ثابتة لأهم العضلات المستخدمة (الفخذين، الربلة، أوتار الركبة)، مدة كل تمدد 20-30 ثانية.",
  },
];

router.get("/teams/:teamId/exercise-library", requireAuth, guarded(async (_req, res, teamId) => {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));

  // Seed once, ever, per team — tracked via the team's own flag rather
  // than "is the library currently empty," which can't tell "never
  // seeded" apart from "seeded, then the coach deleted every starter
  // exercise on purpose." The latter should stay empty.
  if (team && !team.exerciseLibrarySeeded) {
    await db.insert(exerciseLibraryTable).values(STARTER_EXERCISES.map((ex) => ({ ...ex, teamId })));
    await db.update(teamsTable).set({ exerciseLibrarySeeded: true }).where(eq(teamsTable.id, teamId));
  }

  const rows = await db
    .select()
    .from(exerciseLibraryTable)
    .where(eq(exerciseLibraryTable.teamId, teamId))
    .orderBy(exerciseLibraryTable.createdAt);
  res.json(rows);
}));

router.post("/teams/:teamId/exercise-library", requireAuth, guarded(async (req, res, teamId) => {
  const { title, category, objectiveOffense, objectiveDefense, space, playersFormat, minutes, explanation, image } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const [row] = await db
    .insert(exerciseLibraryTable)
    .values({
      teamId,
      title: title.trim(),
      category: CATEGORIES.includes(category) ? category : "other",
      objectiveOffense: typeof objectiveOffense === "string" && objectiveOffense.trim() ? objectiveOffense.trim() : null,
      objectiveDefense: typeof objectiveDefense === "string" && objectiveDefense.trim() ? objectiveDefense.trim() : null,
      space: typeof space === "string" && space.trim() ? space.trim() : null,
      playersFormat: typeof playersFormat === "string" && playersFormat.trim() ? playersFormat.trim() : null,
      minutes: cleanMinutes(minutes),
      explanation: typeof explanation === "string" && explanation.trim() ? explanation.trim() : null,
      image: sanitizeImage(image),
    })
    .returning();
  res.status(201).json(row);
}));

router.patch("/teams/:teamId/exercise-library/:id", requireAuth, guarded(async (req, res, teamId) => {
  const id = parseInt(req.params.id as string);
  const { title, category, objectiveOffense, objectiveDefense, space, playersFormat, minutes, explanation, image } = req.body ?? {};
  const [row] = await db
    .update(exerciseLibraryTable)
    .set({
      ...(typeof title === "string" && title.trim() && { title: title.trim() }),
      ...(CATEGORIES.includes(category) && { category }),
      ...(objectiveOffense !== undefined && { objectiveOffense: typeof objectiveOffense === "string" && objectiveOffense.trim() ? objectiveOffense.trim() : null }),
      ...(objectiveDefense !== undefined && { objectiveDefense: typeof objectiveDefense === "string" && objectiveDefense.trim() ? objectiveDefense.trim() : null }),
      ...(space !== undefined && { space: typeof space === "string" && space.trim() ? space.trim() : null }),
      ...(playersFormat !== undefined && { playersFormat: typeof playersFormat === "string" && playersFormat.trim() ? playersFormat.trim() : null }),
      ...(minutes !== undefined && { minutes: cleanMinutes(minutes) }),
      ...(explanation !== undefined && { explanation: typeof explanation === "string" && explanation.trim() ? explanation.trim() : null }),
      ...(image !== undefined && { image: sanitizeImage(image) }),
    })
    .where(and(eq(exerciseLibraryTable.id, id), eq(exerciseLibraryTable.teamId, teamId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  res.json(row);
}));

router.delete("/teams/:teamId/exercise-library/:id", requireAuth, guarded(async (req, res, teamId) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db
    .delete(exerciseLibraryTable)
    .where(and(eq(exerciseLibraryTable.id, id), eq(exerciseLibraryTable.teamId, teamId)))
    .returning({ id: exerciseLibraryTable.id });
  if (!row) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  res.status(204).end();
}));

export default router;
