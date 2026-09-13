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

const CATEGORIES = ["warm_up", "possession", "transition", "finishing", "defending", "set_piece", "conditioning", "small_sided_game", "cool_down", "other"];
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
// patterns, defensive shape work, transition play), not sourced or
// copied from any specific drill library or coaching platform.
//
// Each drill has a stable `key` that never changes once assigned —
// this is what the GET route below uses to track, per team, which
// starter drills have already been introduced (see teams.
// seededExerciseKeys). Renaming a drill's title later is fine and
// won't cause it to be "re-seeded" as if new; changing its key would.
const STARTER_EXERCISES: Array<{
  key: string; title: string; category: string; objectiveOffense: string | null; objectiveDefense: string | null;
  space: string | null; playersFormat: string | null; minutes: number | null; explanation: string;
}> = [
  {
    key: "warmup-dynamic-ball",
    title: "تسخين ديناميكي بالكرة", category: "warm_up",
    objectiveOffense: "تحضير اللاعبين حركياً مع لمسة كرة مستمرة", objectiveDefense: null,
    space: "نصف الملعب", playersFormat: "كل لاعب مع كرة", minutes: 10,
    explanation: "يجري اللاعبون بحرية داخل المساحة المحددة ومعهم كرة، يبدّلون بين الجري الأمامي والخلفي والجانبي، ثم يضيف المدرب لمسات تحكم بسيطة (لمسة واحدة، قلب الكرة، سحب الكرة) كل 30 ثانية تقريباً.",
  },
  {
    key: "warmup-rondo-small",
    title: "رونديه تسخين صغير", category: "warm_up",
    objectiveOffense: "سرعة تمرير الكرة والتواصل البصري قبل الحصة الرئيسية", objectiveDefense: null,
    space: "مربع 8×8 متر", playersFormat: "4 ضد 1 أو 5 ضد 2", minutes: 8,
    explanation: "مجموعة صغيرة تحافظ على الاستحواذ داخل مساحة ضيقة ضد لاعب أو لاعبين بالمنتصف، بلمسة واحدة أو لمستين كحد أقصى.",
  },
  {
    key: "warmup-passing-pairs",
    title: "تسخين بالتمرير الزوجي المتحرك", category: "warm_up",
    objectiveOffense: "تنشيط لمسة الكرة تدريجياً قبل الحصة الرئيسية", objectiveDefense: null,
    space: "نصف الملعب", playersFormat: "أزواج، كل زوج بكرة واحدة", minutes: 8,
    explanation: "يتحرك كل زوج معاً بالمساحة ويتبادلون التمرير أثناء المشي أو الهرولة الخفيفة، يزيد المدرب تدريجياً من سرعة الحركة ويضيف تنويعات باللمسة (لمسة واحدة، تمرير بالخارجي).",
  },
  {
    key: "possession-4v4-neutral",
    title: "استحواذ 4 ضد 4 مع دعم محايد", category: "possession",
    objectiveOffense: "الحفاظ على الكرة تحت ضغط والبحث عن المساحات", objectiveDefense: "الضغط الجماعي لاستعادة الكرة",
    space: "20×15 متر", playersFormat: "4 ضد 4 + لاعبان محايدان", minutes: 12,
    explanation: "فريقان من 4 لاعبين يتنافسان على الاستحواذ، مع لاعبين محايدين يلعبان دائماً مع من يملك الكرة لخلق تفوق عددي 6 ضد 4. الهدف تحقيق عدد معين من التمريرات المتتالية قبل فقدان الكرة.",
  },
  {
    key: "possession-four-zones",
    title: "استحواذ بأربع مناطق", category: "possession",
    objectiveOffense: "تحريك الكرة بين مناطق الملعب وتبديل نقطة الهجوم", objectiveDefense: "تضييق المساحة حسب منطقة الكرة",
    space: "الملعب مقسم لأربع مناطق متساوية", playersFormat: "8 ضد 8 (أو حسب العدد المتاح)", minutes: 15,
    explanation: "يجب على الفريق المستحوذ تحريك الكرة بين المناطق الأربع بترتيب معين قبل محاولة إنهاء الهجمة، يشجع على الاتساع وتبديل جهة اللعب.",
  },
  {
    key: "possession-rondo-3v1",
    title: "رونديه 3 ضد 1 كلاسيكي", category: "possession",
    objectiveOffense: "التمرير السريع والدقيق تحت ضغط مباشر", objectiveDefense: null,
    space: "مربع 6×6 متر", playersFormat: "3 مهاجمين ضد مدافع واحد بالمنتصف", minutes: 8,
    explanation: "أبسط أشكال الرونديه — يتبادل ثلاثة لاعبين تمرير الكرة بلمسة أو لمستين بينما يحاول لاعب واحد بالمنتصف اعتراضها. من يفقد الكرة أو يتسبب باعتراضها يدخل المنتصف بدلاً منه.",
  },
  {
    key: "possession-rondo-6v2",
    title: "رونديه 6 ضد 2 بمساحة كبيرة", category: "possession",
    objectiveOffense: "اختيار زاوية الدعم المناسبة وتوقيت التمرير", objectiveDefense: null,
    space: "مربع 12×12 متر", playersFormat: "6 مهاجمين ضد مدافعين اثنين بالمنتصف", minutes: 10,
    explanation: "مساحة أكبر تسمح باستخدام العمق والاتساع، يركز على قراءة زاوية الدعم الصحيحة قبل استلام الكرة وتحريكها بسرعة لتفادي المدافعين الاثنين بالمنتصف.",
  },
  {
    key: "possession-rondo-positional",
    title: "رونديه موجّه بشكل تشكيلي", category: "possession",
    objectiveOffense: "الحفاظ على شكل التمركز التكتيكي أثناء الاستحواذ", objectiveDefense: null,
    space: "ثلث ملعب واحد", playersFormat: "8 ضد 8 + 4 لاعبين محايدين بأركان المساحة", minutes: 15,
    explanation: "نسخة متقدمة من الرونديه يتوزع فيها اللاعبون بمواقعهم التكتيكية الحقيقية (دفاع/وسط/هجوم) بدل شكل دائري عشوائي، يربط تمارين الاستحواذ المغلقة بشكل اللعب الفعلي بالمباراة.",
  },
  {
    key: "possession-rondo-numbered",
    title: "رونديه بالأرقام", category: "possession",
    objectiveOffense: "البقاء متيقظاً واستمرار حركة إسناد الزوايا", objectiveDefense: null,
    space: "مربع 10×10 متر", playersFormat: "5 ضد 2", minutes: 8,
    explanation: "يُعطى كل لاعب رقماً؛ عندما ينادي المدرب رقماً معيناً يدخل ذلك اللاعب للمنتصف كمدافع بدل من كان هناك. يضيف عنصر المفاجأة وسرعة رد الفعل لتمرين الرونديه المعتاد.",
  },
  {
    key: "possession-time-pressure",
    title: "تمرير بالضغط الزمني", category: "possession",
    objectiveOffense: "سرعة القرار وتمرير الكرة قبل وصول الضغط", objectiveDefense: null,
    space: "نصف الملعب", playersFormat: "6 ضد 6", minutes: 10,
    explanation: "كل لاعب يجب أن يمرر الكرة خلال ثانيتين من استلامها كحد أقصى، يمنع الاحتفاظ الطويل بالكرة ويحسّن سرعة القرار واستقبال الكرة بوضعية جسم صحيحة مسبقاً.",
  },
  {
    key: "transition-immediate-press",
    title: "انتقال فوري بعد استعادة الكرة", category: "transition",
    objectiveOffense: "استغلال الفوضى الدفاعية للخصم فور استعادة الكرة", objectiveDefense: null,
    space: "نصف الملعب", playersFormat: "6 ضد 6 + لاعب محايد", minutes: 12,
    explanation: "بمجرد استعادة الفريق للكرة، الهدف تحويلها فوراً لهجمة سريعة خلال 3 تمريرات كحد أقصى قبل أن ينظم الخصم دفاعه، يدرّب سرعة اتخاذ القرار مباشرة بعد استعادة الاستحواذ.",
  },
  {
    key: "transition-three-zones",
    title: "لعبة الانتقال بثلاث مناطق", category: "transition",
    objectiveOffense: null, objectiveDefense: "منع الخصم من الوصول السريع لمنطقتنا الدفاعية",
    space: "الملعب مقسم لثلاث مناطق طولية", playersFormat: "8 ضد 8", minutes: 15,
    explanation: "عند استعادة الكرة بالمنطقة الدفاعية، يجب الوصول بها للمنطقة الهجومية خلال زمن محدد (مثلاً 8 ثوانٍ) لتحفيز اللعب المباشر السريع بدل تدوير الكرة ببطء.",
  },
  {
    key: "transition-six-second",
    title: "تحول دفاعي سريع خلال 6 ثوانٍ", category: "transition",
    objectiveOffense: null, objectiveDefense: "الضغط الجماعي الفوري أو التراجع السريع المنظم",
    space: "نصف الملعب", playersFormat: "7 ضد 7", minutes: 12,
    explanation: "بمجرد فقدان الكرة، يجب على أقرب 2-3 لاعبين الضغط الفوري لاستعادتها خلال 6 ثوانٍ؛ إذا فشلت المحاولة يتراجع الفريق كاملاً بسرعة لتنظيم الشكل الدفاعي.",
  },
  {
    key: "transition-4v4-two-goals",
    title: "انتقال 4 ضد 4 بمرميين متبادلين", category: "transition",
    objectiveOffense: "التحول الذهني السريع من دفاع لهجوم والعكس", objectiveDefense: null,
    space: "25×20 متر", playersFormat: "4 ضد 4 بمرميين على طرفي الملعب", minutes: 12,
    explanation: "كل فريق يهاجم مرمى ويدافع عن الآخر؛ تبديل الاتجاه المستمر عند كل استحواذ يجبر اللاعبين على التبديل السريع بين الذهنية الهجومية والدفاعية بدون توقف.",
  },
  {
    key: "finishing-crosses",
    title: "إنهاء من العرضيات الجانبية", category: "finishing",
    objectiveOffense: "التموضع الصحيح داخل منطقة الجزاء لاستقبال العرضية", objectiveDefense: null,
    space: "ثلث الملعب الهجومي", playersFormat: "لاعبان بالأطراف + 3 مهاجمين + حارس", minutes: 15,
    explanation: "يرسل اللاعبون الجانبيون كرات عرضية متنوعة (أرضية، عالية، خلف خط الدفاع) بينما يتناوب المهاجمون على الجري داخل منطقة الجزاء بتوقيت مختلف لإنهاء الكرات بالرأس أو القدم.",
  },
  {
    key: "finishing-quick-pressure",
    title: "تسديد سريع تحت ضغط", category: "finishing",
    objectiveOffense: "التحكم والتسديد السريع خلال لمستين كحد أقصى", objectiveDefense: null,
    space: "منطقة الجزاء وما حولها", playersFormat: "فردي أو أزواج", minutes: 10,
    explanation: "يستقبل اللاعب تمريرة من زاوية مختلفة في كل مرة (من الخلف، الجانب، الأمام) ويجب عليه التحكم والتسديد سريعاً، مع مدافع خفيف الضغط لمحاكاة ضغط المباراة الحقيقي.",
  },
  {
    key: "finishing-wing-breakthrough",
    title: "إنهاء بعد اختراق الجناح", category: "finishing",
    objectiveOffense: "التوقيت الصحيح للركض داخل منطقة الجزاء عند اختراق الجناح", objectiveDefense: null,
    space: "ثلث الملعب الهجومي", playersFormat: "مهاجمان + جناح ضد مدافعين اثنين وحارس", minutes: 12,
    explanation: "يخترق اللاعب الجانبي بالكرة تجاه خط الجزاء ثم يقرر بين التمرير الأرضي المرتد أو العرضية المنخفضة، بينما يتحرك المهاجمان لملء المناطق المختلفة داخل منطقة الجزاء.",
  },
  {
    key: "defending-1v1-width",
    title: "دفاع 1 ضد 1 بالعرض", category: "defending",
    objectiveOffense: null, objectiveDefense: "تأخير المهاجم وتوجيهه نحو الخط الجانبي",
    space: "10×10 متر", playersFormat: "1 ضد 1", minutes: 10,
    explanation: "يبدأ المهاجم بالكرة من المنتصف، والهدف الدفاعي تأخير التقدم وتوجيه المهاجم بعيداً عن المرمى دون تدخل متسرع، مع التركيز على وضعية الجسم وخطوات القدمين.",
  },
  {
    key: "defending-high-line",
    title: "تنظيم خط الدفاع المرتفع", category: "defending",
    objectiveOffense: null, objectiveDefense: "الحفاظ على خط دفاعي مستقيم والتقدم/التراجع الجماعي",
    space: "نصف الملعب", playersFormat: "4 مدافعين ضد 3-4 مهاجمين", minutes: 15,
    explanation: "يتدرب خط الدفاع على التحرك ككتلة واحدة صعوداً ونزولاً حسب موقع الكرة، مع التركيز على تنفيذ فخ التسلل بتوقيت جماعي عند تمرير الكرة للخلف من المهاجمين.",
  },
  {
    key: "defending-outnumbered",
    title: "دفاع بتفوق عددي معاكس 3 ضد 4", category: "defending",
    objectiveOffense: null, objectiveDefense: "التنظيم الجماعي لتعويض النقص العددي",
    space: "ثلث الملعب الدفاعي", playersFormat: "3 مدافعين ضد 4 مهاجمين", minutes: 12,
    explanation: "يتدرب المدافعون الثلاثة على العمل الجماعي المنظم لتعويض النقص العددي، بالتغطية المتبادلة وتضييق المساحات بدل محاولة تغطية كل لاعب بمفرده.",
  },
  {
    key: "setpiece-corner-short",
    title: "ركلة ركنية قصيرة ومناورة", category: "set_piece",
    objectiveOffense: "خلق مساحة للتسديد أو العرضية الثانية بتوقيت جماعي", objectiveDefense: null,
    space: "منطقة الجزاء وحولها", playersFormat: "حسب التشكيلة الأساسية", minutes: 10,
    explanation: "يتدرب الفريق على تنويعة ركنية قصيرة (تمريرة قصيرة للاعب القريب) تليها مناورة تبديل مواقع، مع التركيز على التوقيت بين اللاعبين.",
  },
  {
    key: "setpiece-defend-freekick-wide",
    title: "دفاع الركلات الحرة الجانبية", category: "set_piece",
    objectiveOffense: null, objectiveDefense: "تغطية المناطق الخطرة وتحديد المسؤوليات بوضوح",
    space: "منطقة الجزاء", playersFormat: "حسب التشكيلة الأساسية", minutes: 10,
    explanation: "يتدرب الفريق على نظام دفاعي مختلط (رجل لرجل + تغطية مناطق) ضد الركلات الحرة الجانبية، مع تحديد لاعب مسؤول عن كل عمود ومن يغطي العارضة.",
  },
  {
    key: "setpiece-direct-freekick",
    title: "تسديد الركلات الحرة المباشرة فوق الحائط", category: "set_piece",
    objectiveOffense: "دقة التسديد فوق الحائط وتوقيت الانحناء", objectiveDefense: null,
    space: "حافة منطقة الجزاء", playersFormat: "فردي أو مجموعة صغيرة", minutes: 10,
    explanation: "يتدرب اللاعبون المتخصصون بالركلات الثابتة على التسديد المباشر فوق حائط من اللاعبين (أو أعمدة بديلة)، بتنويع القوة والانحناء حسب المسافة والزاوية.",
  },
  {
    key: "setpiece-long-throw",
    title: "رمية تماس طويلة كسلاح هجومي", category: "set_piece",
    objectiveOffense: "التوقيت الجماعي لاستقبال الرمية الطويلة", objectiveDefense: null,
    space: "قرب خط التماس بالثلث الأخير", playersFormat: "رامي متخصص + 3-4 مهاجمين", minutes: 8,
    explanation: "يتدرب الفريق على استغلال رمية التماس الطويلة كبديل لركلة ركنية، مع تحركات مؤقتة داخل منطقة الجزاء لخلق مساحة للاعب المستهدف.",
  },
  {
    key: "conditioning-ball-repeats",
    title: "تكرارات سريعة بالكرة", category: "conditioning",
    objectiveOffense: "الجمع بين السرعة والتحكم بالكرة تحت التعب", objectiveDefense: null,
    space: "30×20 متر", playersFormat: "فردي", minutes: 12,
    explanation: "سلسلة تكرارات من الجري السريع لمسافة 20-30 متر مع الكرة، بفترات راحة قصيرة بينها، تحاكي متطلبات اللياقة الخاصة بكرة القدم بدلاً من الجري الصرف.",
  },
  {
    key: "conditioning-interval-circuit",
    title: "دائرة لياقة بالكرة بفترات متغيرة", category: "conditioning",
    objectiveOffense: "الحفاظ على جودة اللمسة تحت التعب البدني", objectiveDefense: null,
    space: "40×30 متر بمحطات متعددة", playersFormat: "مجموعات صغيرة تتناوب بين المحطات", minutes: 15,
    explanation: "عدة محطات (تمرير سريع، مراوغة بالمخاريط، تسديد) يتنقل بينها اللاعبون بفترات عمل 30-45 ثانية وراحة قصيرة، يجمع بين المتطلب البدني والتقني بنفس الوقت.",
  },
  {
    key: "ssg-small-goals",
    title: "لعبة مصغرة بمرميين صغيرين", category: "small_sided_game",
    objectiveOffense: "اتخاذ القرار السريع والمبادرة الفردية", objectiveDefense: "الضغط المبكر لاستعادة الكرة",
    space: "30×20 متر", playersFormat: "5 ضد 5 بدون حراس", minutes: 15,
    explanation: "مباراة مصغرة بمرميين صغيرين، يمكن إضافة قيود مثل \"لمستين كحد أقصى\" لتحسين سرعة اللعب واتخاذ القرار.",
  },
  {
    key: "ssg-transition",
    title: "لعبة انتقال سريع (هجوم-دفاع)", category: "small_sided_game",
    objectiveOffense: "استغلال اللحظة الأولى بعد استعادة الكرة", objectiveDefense: "الضغط الفوري خلال 5 ثوانٍ بعد فقدان الكرة",
    space: "ملعب متوسط", playersFormat: "7 ضد 7", minutes: 18,
    explanation: "تركز على التحول السريع بين الهجوم والدفاع لحظة فقدان أو استعادة الكرة، بمجرد الفقدان يجب الضغط الفوري لاستعادتها قبل تنظيم الخصم لهجمته.",
  },
  {
    key: "ssg-numbered-goals",
    title: "لعبة مصغرة بأهداف مرقمة", category: "small_sided_game",
    objectiveOffense: "القراءة السريعة وتغيير اتجاه الهجوم فوراً", objectiveDefense: null,
    space: "25×20 متر", playersFormat: "5 ضد 5 بأربع مرايا صغيرة مرقمة بكل طرف", minutes: 15,
    explanation: "بدل مرمى واحد، توجد أربع مرايا صغيرة مرقمة بكل جهة؛ ينادي المدرب رقماً معيناً كل فترة ليصبح هو الهدف الوحيد المسموح بالتسجيل فيه، يحفّز القراءة السريعة وتغيير الخطة الهجومية باستمرار.",
  },
  {
    key: "cooldown-stretch",
    title: "تهدئة واستطالة", category: "cool_down",
    objectiveOffense: null, objectiveDefense: null,
    space: "أي مكان", playersFormat: null, minutes: 8,
    explanation: "مشي خفيف لتقليل معدل ضربات القلب تدريجياً، متبوع بتمارين استطالة ثابتة لأهم العضلات المستخدمة (الفخذين، الربلة، أوتار الركبة)، مدة كل تمدد 20-30 ثانية.",
  },
];

router.get("/teams/:teamId/exercise-library", requireAuth, guarded(async (_req, res, teamId) => {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) {
    res.json([]);
    return;
  }

  let existingRows = await db
    .select()
    .from(exerciseLibraryTable)
    .where(eq(exerciseLibraryTable.teamId, teamId))
    .orderBy(exerciseLibraryTable.createdAt);

  let seededKeys: string[] = [];
  try {
    const parsed = team.seededExerciseKeys ? JSON.parse(team.seededExerciseKeys) : [];
    if (Array.isArray(parsed)) seededKeys = parsed.filter((k) => typeof k === "string");
  } catch {
    seededKeys = [];
  }
  const seededSet = new Set(seededKeys);

  // Backfill for teams seeded before this key-tracking existed (an
  // earlier version of this route seeded the original 14 drills using
  // a plain boolean flag, with no key recorded anywhere). Match by
  // title against the catalog to infer which keys they already
  // received, so those don't get inserted a second time below.
  //
  // Known limitation: if a coach deleted one of the original 14
  // between that earlier version shipping and this one, title-matching
  // can't tell "never had this drill" apart from "had it, deleted it
  // on purpose" — it would incorrectly treat a deleted one as missing
  // and re-add it. Accepted here since this feature shipped minutes
  // before this fix, making that window essentially empty in practice;
  // every drill added from this point forward is protected properly
  // via its own key regardless of when it's deleted.
  if (seededSet.size === 0 && existingRows.length > 0) {
    const existingTitles = new Set(existingRows.map((r) => r.title));
    for (const ex of STARTER_EXERCISES) {
      if (existingTitles.has(ex.title)) seededSet.add(ex.key);
    }
  }

  const missing = STARTER_EXERCISES.filter((ex) => !seededSet.has(ex.key));
  if (missing.length > 0) {
    await db.insert(exerciseLibraryTable).values(missing.map(({ key, ...ex }) => ({ ...ex, teamId })));
    missing.forEach((ex) => seededSet.add(ex.key));
    await db
      .update(teamsTable)
      .set({ seededExerciseKeys: JSON.stringify(Array.from(seededSet)) })
      .where(eq(teamsTable.id, teamId));
    existingRows = await db
      .select()
      .from(exerciseLibraryTable)
      .where(eq(exerciseLibraryTable.teamId, teamId))
      .orderBy(exerciseLibraryTable.createdAt);
  } else if (existingRows.length > 0 && team.seededExerciseKeys == null) {
    // Backfill happened above (matched by title) but nothing new needed
    // inserting — still persist the inferred key list so this same
    // title-matching scan doesn't re-run on every future request.
    await db
      .update(teamsTable)
      .set({ seededExerciseKeys: JSON.stringify(Array.from(seededSet)) })
      .where(eq(teamsTable.id, teamId));
  }

  res.json(existingRows);
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
