"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.POST = void 0;
var server_1 = require("next/server");
var server_2 = require("@/lib/supabase/server");
var supabase_js_1 = require("@supabase/supabase-js");
var sdk_1 = require("@anthropic-ai/sdk");
var anthropic = new sdk_1["default"]({ apiKey: process.env.ANTHROPIC_API_KEY });
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getNextMonday() {
    var today = new Date();
    var day = today.getDay();
    var daysUntil = day === 0 ? 1 : 8 - day;
    var next = new Date(today);
    next.setDate(today.getDate() + daysUntil);
    return next.toISOString().split('T')[0];
}
function calculateSessionDate(blockStart, weekNumber, dayOfWeek) {
    var start = new Date(blockStart + 'T00:00:00Z');
    var mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    var date = new Date(start);
    date.setUTCDate(start.getUTCDate() + (weekNumber - 1) * 7 + mondayOffset);
    return date.toISOString().split('T')[0];
}
function stripMarkdown(text) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}
function generateEmbedding(text) {
    return __awaiter(this, void 0, Promise, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/generate-embedding", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY
                        },
                        body: JSON.stringify({ text: text })
                    })];
                case 1:
                    res = _a.sent();
                    if (!res.ok)
                        throw new Error("Embedding failed: " + res.status);
                    return [4 /*yield*/, res.json()];
                case 2: return [2 /*return*/, (_a.sent()).embedding];
            }
        });
    });
}
function queryKnowledge(adminClient, queryText, filterCategory, matchCount) {
    if (filterCategory === void 0) { filterCategory = null; }
    if (matchCount === void 0) { matchCount = 5; }
    return __awaiter(this, void 0, Promise, function () {
        var embedding, params, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, generateEmbedding(queryText)];
                case 1:
                    embedding = _b.sent();
                    params = __assign({ query_embedding: JSON.stringify(embedding), match_count: matchCount }, (filterCategory ? { filter_category: filterCategory } : {}));
                    return [4 /*yield*/, adminClient.rpc('match_knowledge', params)];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw new Error("KB query failed: " + error.message);
                    return [2 /*return*/, data !== null && data !== void 0 ? data : []];
            }
        });
    });
}
// ─── Progression spine — pure maths, no LLM ──────────────────────────────────
function buildProgressionSpine(movements, durationWeeks, deloadWeeks) {
    return movements
        .filter(function (m) { return !m.is_running; })
        .map(function (m) {
        var _a;
        var baseline1rm = parseFloat((_a = m.current_value) !== null && _a !== void 0 ? _a : '0');
        var weeks = Array.from({ length: durationWeeks }, function (_, i) {
            var week = i + 1;
            var isDeload = deloadWeeks.includes(week);
            var pct;
            var targetRpe;
            if (isDeload) {
                pct = 70;
                targetRpe = 5;
            }
            else if (m.progression_type === 'linear_percentage') {
                pct = Math.min(78 + i * 2.5, 90);
                targetRpe = Math.min(6 + Math.floor(i * 0.5), 9);
            }
            else if (m.progression_type === 'wave_loading') {
                var pos = i % 3;
                var round = Math.floor(i / 3);
                pct = [75, 80, 85][pos] + round * 2;
                targetRpe = [7, 8, 9][pos];
            }
            else {
                pct = null;
                targetRpe = Math.min(6 + Math.floor(i * 0.4), 9);
            }
            var weight_kg = pct && baseline1rm > 0
                ? Math.round((baseline1rm * pct / 100) / 2.5) * 2.5
                : null;
            return __assign({ week: week, sets: isDeload ? Math.max(Math.ceil(m.sets * 0.6), 1) : m.sets, reps: m.reps, pct_1rm: pct, weight_kg: weight_kg, target_rpe: targetRpe }, (isDeload ? { note: 'deload' } : {}));
        });
        return {
            movement: m.movement_label,
            movement_id: m.movement_id,
            scheme_name: m.scheme_name,
            progression_type: m.progression_type,
            baseline_1rm_kg: baseline1rm,
            weeks: weeks
        };
    });
}
// ─── Stage A: Block Planner prompt ───────────────────────────────────────────
function buildBlockPlannerPrompt(athleteProfile, benchmarkLifts, selectedGoals, selectedMovements, kbArticles) {
    var kbSection = kbArticles.map(function (k) { return "### " + k.title + "\n" + k.content; }).join('\n\n');
    var system = "You are an expert hybrid athlete coach. Generate a periodised training block structure.\n\n## PROGRAMMING RULES\n\nSession structure (6-day default): Mon=CrossFit+Run | Tue=Olympic Pull+Accessories | Wed=CrossFit | Thu=Olympic Push+Accessories | Fri=CrossFit | Sat=Olympic Legs+Accessories | Sun=Easy Run\n\nPriority when days reduced: 1. Olympic Lifting \u2192 2. CrossFit \u2192 3. Running\n\nBlock length: beginner=4wks (deload wk3) | intermediate=8wks (deload wks 4,8) | advanced=10wks (deload wks 4,8,10)\n\nInterference: No threshold run within 6hrs of lifting. 48hr min between heavy sessions.\n\n" + (kbSection ? "## KNOWLEDGE BASE\n" + kbSection : '') + "\n\n## OUTPUT FORMAT\nReturn ONLY valid JSON \u2014 no markdown, no text outside the object.\n\nIMPORTANT: Generate session shells for WEEKS 1 AND 2 ONLY.\nWeeks 3+ are represented only as weekly_plan entries \u2014 sessions are generated on demand as the week approaches.\nDo NOT include an exercises array.\n\n{\n  \"training_block\": {\n    \"title\": \"string\",\n    \"goal\": \"string\",\n    \"sport_focus\": [\"crossfit\",\"olympic_lifting\",\"run\"],\n    \"duration_weeks\": 8,\n    \"ai_block_plan\": {\n      \"phase_overview\": \"string\",\n      \"weekly_intent\": [{ \"week\": 1, \"focus\": \"string\", \"load\": \"low|moderate|high|deload\" }],\n      \"programming_notes\": \"string\"\n    }\n  },\n  \"weekly_plans\": [{\n    \"week_number\": 1,\n    \"weekly_focus\": \"string\",\n    \"planned_load\": \"low|moderate|high|deload\",\n    \"ai_notes\": \"string\"\n  }],\n  \"sessions\": [{\n    \"week_number\": 1,\n    \"title\": \"string\",\n    \"session_type\": \"crossfit|olympic_lifting|run|strength|rest|active_recovery\",\n    \"priority\": \"key|standard|optional\",\n    \"day_of_week\": 1,\n    \"duration_mins\": 60,\n    \"ai_rationale\": \"string\",\n    \"has_spine_anchor\": false,\n    \"spine_movement_ids\": []\n  }]\n}";
    var movementList = selectedMovements.length > 0
        ? selectedMovements.map(function (m) { var _a; return "- " + m.movement_label + " (" + m.pattern + "): " + m.scheme_name + ", " + m.sets + "\u00D7" + m.reps + ", current 1RM: " + ((_a = m.current_value) !== null && _a !== void 0 ? _a : 'unknown') + " kg"; }).join('\n')
        : 'None selected';
    var user = "Today: " + new Date().toISOString().split('T')[0] + "\n\n## Goals\n" + (selectedGoals.join(', ') || 'Not specified') + "\n\n## Key Movements (Progression Spine)\n" + movementList + "\n\n## Athlete Profile\n" + JSON.stringify(athleteProfile, null, 2) + "\n\n## Benchmark Lifts\n" + ((benchmarkLifts === null || benchmarkLifts === void 0 ? void 0 : benchmarkLifts.length) ? JSON.stringify(benchmarkLifts, null, 2) : 'None recorded.');
    return { system: system, user: user };
}
// ─── Stage B: Session Detailer prompt (per session) ──────────────────────────
function buildSessionDetailPrompt(session, weekPlan, blockOverview, athleteProfile, spineAnchors, kbArticles) {
    var kbSection = kbArticles.map(function (k) { return "### " + k.title + "\n" + k.content; }).join('\n\n');
    var system = "You are an expert hybrid athlete coach detailing a single training session.\n\nGenerate the exercise list for this session. Return ONLY valid JSON \u2014 no markdown.\n\nRules:\n- If spine anchors are listed, do NOT include them in exercises (they are already prescribed). Build the session around them.\n- Use weight_pct_1rm for all strength work. Never hardcode kg.\n- order_index starts at 0 and increments by 1.\n- Max 4 accessories per session.\n- For CrossFit sessions: include a warm-up, skill/strength piece, metcon, and cool-down.\n- For run sessions: specify distance_m or duration_secs and pace_per_km.\n\n" + (kbSection ? "## EXERCISE LIBRARY\n" + kbSection : '') + "\n\n## OUTPUT FORMAT\n{ \"exercises\": [{ \"order_index\": 0, \"name\": \"string\", \"exercise_type\": \"lift|run|row|ski|bike|gymnastics|conditioning|accessory\", \"sets\": null, \"reps\": null, \"reps_note\": null, \"weight_pct_1rm\": null, \"distance_m\": null, \"duration_secs\": null, \"pace_per_km\": null, \"rest_secs\": null, \"notes\": null }] }";
    var anchorSection = spineAnchors.length > 0
        ? "\n## Spine Anchors (ALREADY PRESCRIBED \u2014 do not include in exercises)\n" + spineAnchors.map(function (a) {
            return "- " + a.movement + ": " + a.sets + "\u00D7" + a.reps + (a.weight_kg ? " @ " + a.weight_kg + "kg" : a.pct_1rm ? " @ " + a.pct_1rm + "% 1RM" : '') + " (target RPE " + a.target_rpe + ")";
        }).join('\n')
        : '';
    var user = "Session to detail:\n- Title: " + session.title + "\n- Type: " + session.session_type + "\n- Priority: " + session.priority + "\n- Duration: " + session.duration_mins + " min\n- Week " + weekPlan.week_number + ": " + weekPlan.weekly_focus + " (" + weekPlan.planned_load + " load)\n- Block overview: " + blockOverview + "\n" + anchorSection + "\n\n## Athlete\n- CrossFit: " + athleteProfile.crossfit_level + " | Lifting: " + athleteProfile.lifting_level + " | Running: " + athleteProfile.running_level;
    console.log(user);
    return { system: system, user: user };
}
// ─── Route handler ────────────────────────────────────────────────────────────
function POST(request) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, _a, user, authErr, body, _b, user_id, _c, selected_goals, _d, selected_movements, adminClient, _e, _f, athleteProfile, profileErr, benchmarkLifts, ragQuery, kbRules, err_1, _g, bpSystem, bpUser, blockPlan, msg, raw, stopReason, err_2, deloadWeeks, progressionSpine, spineWeek1, _i, progressionSpine_1, entry, w1, blockStart, _h, blockRow, blockErr, blockId, weeklyPlanRows, _j, weekRows, weekErr, weekIdMap, sessionRows, _k, sessionData, sessionErr, sessionIdMap, week1Sessions, sessionTypes, kbExercises, err_3, week1Plan, phaseOverview, detailResults, failures, successCount;
        var _this = this;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    supabase = server_2.createClient();
                    return [4 /*yield*/, supabase.auth.getUser()];
                case 1:
                    _a = _l.sent(), user = _a.data.user, authErr = _a.error;
                    if (authErr || !user) {
                        return [2 /*return*/, server_1.NextResponse.json({ error: 'Unauthorized' }, { status: 401 })];
                    }
                    return [4 /*yield*/, request.json()];
                case 2:
                    body = _l.sent();
                    _b = body, user_id = _b.user_id, _c = _b.selected_goals, selected_goals = _c === void 0 ? [] : _c, _d = _b.selected_movements, selected_movements = _d === void 0 ? [] : _d;
                    if (user_id !== user.id) {
                        return [2 /*return*/, server_1.NextResponse.json({ error: 'user_id must match authenticated user' }, { status: 403 })];
                    }
                    adminClient = supabase_js_1.createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                    return [4 /*yield*/, Promise.all([
                            adminClient.from('athlete_profiles').select('*').eq('user_id', user_id).single(),
                            adminClient.from('benchmark_lifts').select('*').eq('user_id', user_id),
                        ])];
                case 3:
                    _e = _l.sent(), _f = _e[0], athleteProfile = _f.data, profileErr = _f.error, benchmarkLifts = _e[1].data;
                    if (profileErr || !athleteProfile) {
                        return [2 /*return*/, server_1.NextResponse.json({ error: 'Athlete profile not found. Complete onboarding first.' }, { status: 404 })];
                    }
                    ragQuery = "hybrid athlete " + selected_goals.join(' ') + " " + selected_movements.map(function (m) { return m.movement_label; }).join(' ') + " programming sequencing";
                    kbRules = [];
                    _l.label = 4;
                case 4:
                    _l.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, queryKnowledge(adminClient, ragQuery, null, 5)];
                case 5:
                    kbRules = _l.sent();
                    console.log('[generate-plan] Block planner KB:', kbRules.map(function (k) { return k.title; }));
                    return [3 /*break*/, 7];
                case 6:
                    err_1 = _l.sent();
                    console.warn('[generate-plan] RAG failed, continuing:', err_1.message);
                    return [3 /*break*/, 7];
                case 7:
                    _g = buildBlockPlannerPrompt(athleteProfile, benchmarkLifts !== null && benchmarkLifts !== void 0 ? benchmarkLifts : [], selected_goals, selected_movements, kbRules), bpSystem = _g.system, bpUser = _g.user;
                    _l.label = 8;
                case 8:
                    _l.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, anthropic.messages.create({
                            model: 'claude-sonnet-4-6',
                            max_tokens: 8000,
                            system: bpSystem,
                            messages: [{ role: 'user', content: bpUser }]
                        })];
                case 9:
                    msg = _l.sent();
                    raw = msg.content[0].text;
                    stopReason = msg.stop_reason;
                    console.log("[generate-plan] Block planner raw length: " + raw.length + " chars, stop_reason: " + stopReason);
                    if (stopReason === 'max_tokens') {
                        console.error('[generate-plan] Block planner hit max_tokens — response truncated');
                    }
                    blockPlan = JSON.parse(stripMarkdown(raw));
                    console.log('[generate-plan] Block plan received:', {
                        title: blockPlan.training_block.title,
                        weeks: blockPlan.training_block.duration_weeks,
                        sessions: blockPlan.sessions.length
                    });
                    return [3 /*break*/, 11];
                case 10:
                    err_2 = _l.sent();
                    console.error('[generate-plan] Block planner error:', err_2);
                    return [2 /*return*/, server_1.NextResponse.json({ error: 'Failed to generate block structure. Please retry.' }, { status: 500 })];
                case 11:
                    deloadWeeks = blockPlan.training_block.ai_block_plan.weekly_intent
                        .filter(function (w) { return w.load === 'deload'; })
                        .map(function (w) { return w.week; });
                    progressionSpine = buildProgressionSpine(selected_movements, blockPlan.training_block.duration_weeks, deloadWeeks);
                    console.log('[generate-plan] Spine calculated for:', progressionSpine.map(function (s) { return s.movement; }));
                    spineWeek1 = {};
                    for (_i = 0, progressionSpine_1 = progressionSpine; _i < progressionSpine_1.length; _i++) {
                        entry = progressionSpine_1[_i];
                        w1 = entry.weeks.find(function (w) { return w.week === 1; });
                        if (w1)
                            spineWeek1[entry.movement_id] = {
                                movement: entry.movement,
                                sets: w1.sets,
                                reps: String(w1.reps),
                                weight_kg: w1.weight_kg,
                                pct_1rm: w1.pct_1rm,
                                target_rpe: w1.target_rpe
                            };
                    }
                    blockStart = getNextMonday();
                    return [4 /*yield*/, adminClient
                            .from('training_blocks')
                            .insert({
                            user_id: user_id,
                            title: blockPlan.training_block.title,
                            goal: blockPlan.training_block.goal,
                            sport_focus: blockPlan.training_block.sport_focus,
                            duration_weeks: blockPlan.training_block.duration_weeks,
                            start_date: blockStart,
                            status: 'active',
                            ai_block_plan: __assign(__assign({}, blockPlan.training_block.ai_block_plan), { progression_spine: progressionSpine, selected_goals: selected_goals })
                        })
                            .select('id')
                            .single()];
                case 12:
                    _h = _l.sent(), blockRow = _h.data, blockErr = _h.error;
                    if (blockErr || !blockRow) {
                        return [2 /*return*/, server_1.NextResponse.json({ error: "DB error (training_blocks): " + (blockErr === null || blockErr === void 0 ? void 0 : blockErr.message) }, { status: 500 })];
                    }
                    blockId = blockRow.id;
                    weeklyPlanRows = blockPlan.weekly_plans.map(function (wp) {
                        var weekStart = new Date(blockStart + 'T00:00:00Z');
                        weekStart.setUTCDate(weekStart.getUTCDate() + (wp.week_number - 1) * 7);
                        var weekEnd = new Date(weekStart);
                        weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
                        return {
                            block_id: blockId,
                            user_id: user_id,
                            week_number: wp.week_number,
                            week_start_date: weekStart.toISOString().split('T')[0],
                            week_end_date: weekEnd.toISOString().split('T')[0],
                            weekly_focus: wp.weekly_focus,
                            planned_load: wp.planned_load,
                            ai_notes: wp.ai_notes,
                            status: wp.week_number === 1 ? 'active' : 'upcoming'
                        };
                    });
                    return [4 /*yield*/, adminClient
                            .from('weekly_plans').insert(weeklyPlanRows).select('id, week_number')];
                case 13:
                    _j = _l.sent(), weekRows = _j.data, weekErr = _j.error;
                    if (!(weekErr || !weekRows)) return [3 /*break*/, 15];
                    return [4 /*yield*/, adminClient.from('training_blocks')["delete"]().eq('id', blockId)];
                case 14:
                    _l.sent();
                    return [2 /*return*/, server_1.NextResponse.json({ error: "DB error (weekly_plans): " + (weekErr === null || weekErr === void 0 ? void 0 : weekErr.message) }, { status: 500 })];
                case 15:
                    weekIdMap = new Map(weekRows.map(function (r) { return [r.week_number, r.id]; }));
                    sessionRows = blockPlan.sessions.map(function (s) {
                        var _a;
                        return ({
                            user_id: user_id,
                            block_id: blockId,
                            weekly_plan_id: (_a = weekIdMap.get(s.week_number)) !== null && _a !== void 0 ? _a : null,
                            title: s.title,
                            session_type: s.session_type,
                            priority: s.priority,
                            scheduled_date: calculateSessionDate(blockStart, s.week_number, s.day_of_week),
                            duration_mins: s.duration_mins,
                            status: 'scheduled',
                            ai_rationale: s.ai_rationale
                        });
                    });
                    return [4 /*yield*/, adminClient
                            .from('sessions').insert(sessionRows).select('id')];
                case 16:
                    _k = _l.sent(), sessionData = _k.data, sessionErr = _k.error;
                    if (!(sessionErr || !sessionData)) return [3 /*break*/, 19];
                    return [4 /*yield*/, adminClient.from('weekly_plans')["delete"]().eq('block_id', blockId)];
                case 17:
                    _l.sent();
                    return [4 /*yield*/, adminClient.from('training_blocks')["delete"]().eq('id', blockId)];
                case 18:
                    _l.sent();
                    return [2 /*return*/, server_1.NextResponse.json({ error: "DB error (sessions): " + (sessionErr === null || sessionErr === void 0 ? void 0 : sessionErr.message) }, { status: 500 })];
                case 19:
                    sessionIdMap = new Map(sessionData.map(function (r, i) { return [i, r.id]; }));
                    week1Sessions = blockPlan.sessions
                        .map(function (s, idx) { return (__assign(__assign({}, s), { arrayIdx: idx })); })
                        .filter(function (s) { return s.week_number === 1; });
                    sessionTypes = Array.from(new Set(week1Sessions.map(function (s) { return s.session_type; }))).join(' ');
                    kbExercises = [];
                    _l.label = 20;
                case 20:
                    _l.trys.push([20, 22, , 23]);
                    return [4 /*yield*/, queryKnowledge(adminClient, sessionTypes + " exercises accessories technique", 'exercise-library', 5)];
                case 21:
                    kbExercises = _l.sent();
                    console.log('[generate-plan] Exercise KB:', kbExercises.map(function (k) { return k.title; }));
                    return [3 /*break*/, 23];
                case 22:
                    err_3 = _l.sent();
                    console.warn('[generate-plan] Exercise KB fetch failed:', err_3.message);
                    return [3 /*break*/, 23];
                case 23:
                    week1Plan = blockPlan.weekly_plans.find(function (wp) { return wp.week_number === 1; });
                    phaseOverview = blockPlan.training_block.ai_block_plan.phase_overview;
                    return [4 /*yield*/, Promise.allSettled(week1Sessions.map(function (session) { return __awaiter(_this, void 0, void 0, function () {
                            var sessionId, spineAnchors, _a, sdSystem, sdUser, msg, raw, detail, exerciseRows, exErr, spineRows, spineErr;
                            var _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        sessionId = sessionIdMap.get(session.arrayIdx);
                                        if (!sessionId)
                                            return [2 /*return*/];
                                        spineAnchors = ((_b = session.spine_movement_ids) !== null && _b !== void 0 ? _b : [])
                                            .map(function (id) { return spineWeek1[id]; })
                                            .filter(Boolean);
                                        _a = buildSessionDetailPrompt(session, week1Plan, phaseOverview, athleteProfile, spineAnchors, kbExercises), sdSystem = _a.system, sdUser = _a.user;
                                        return [4 /*yield*/, anthropic.messages.create({
                                                model: 'claude-haiku-4-5-20251001',
                                                max_tokens: 1500,
                                                system: sdSystem,
                                                messages: [{ role: 'user', content: sdUser }]
                                            })];
                                    case 1:
                                        msg = _c.sent();
                                        raw = msg.content[0].text;
                                        detail = JSON.parse(stripMarkdown(raw));
                                        exerciseRows = detail.exercises.map(function (e) { return ({
                                            session_id: sessionId,
                                            user_id: user_id,
                                            order_index: e.order_index,
                                            name: e.name,
                                            exercise_type: e.exercise_type,
                                            sets: e.sets,
                                            reps: e.reps,
                                            reps_note: e.reps_note,
                                            weight_pct_1rm: e.weight_pct_1rm,
                                            distance_m: e.distance_m,
                                            duration_secs: e.duration_secs,
                                            pace_per_km: e.pace_per_km ? String(e.pace_per_km) : null,
                                            rest_secs: e.rest_secs,
                                            notes: e.notes
                                        }); });
                                        if (!(exerciseRows.length > 0)) return [3 /*break*/, 3];
                                        return [4 /*yield*/, adminClient.from('exercises').insert(exerciseRows)];
                                    case 2:
                                        exErr = (_c.sent()).error;
                                        if (exErr)
                                            throw new Error("exercises insert: " + exErr.message);
                                        _c.label = 3;
                                    case 3:
                                        if (!(spineAnchors.length > 0)) return [3 /*break*/, 5];
                                        spineRows = spineAnchors.map(function (anchor, i) { return ({
                                            session_id: sessionId,
                                            user_id: user_id,
                                            order_index: -(spineAnchors.length - i),
                                            name: anchor.movement,
                                            exercise_type: 'lift',
                                            sets: anchor.sets,
                                            reps: null,
                                            reps_note: anchor.reps,
                                            weight_pct_1rm: anchor.pct_1rm,
                                            distance_m: null,
                                            duration_secs: null,
                                            pace_per_km: null,
                                            rest_secs: null,
                                            notes: "Target RPE " + anchor.target_rpe + (anchor.weight_kg ? " \u2014 " + anchor.weight_kg + " kg" : '')
                                        }); });
                                        return [4 /*yield*/, adminClient.from('exercises').insert(spineRows)];
                                    case 4:
                                        spineErr = (_c.sent()).error;
                                        if (spineErr)
                                            throw new Error("spine exercises insert: " + spineErr.message);
                                        _c.label = 5;
                                    case 5:
                                        console.log("[generate-plan] Session \"" + session.title + "\" detailed: " + exerciseRows.length + " exercises + " + spineAnchors.length + " spine anchors");
                                        return [2 /*return*/];
                                }
                            });
                        }); }))
                        // Log any session detail failures (non-fatal — block + shells are already saved)
                    ];
                case 24:
                    detailResults = _l.sent();
                    failures = detailResults.filter(function (r) { return r.status === 'rejected'; });
                    if (failures.length > 0) {
                        failures.forEach(function (f) { return console.error('[generate-plan] Session detail failed:', f.reason); });
                    }
                    successCount = detailResults.filter(function (r) { return r.status === 'fulfilled'; }).length;
                    console.log('[generate-plan] Complete:', {
                        block_id: blockId,
                        weeks: weeklyPlanRows.length,
                        sessions: sessionRows.length,
                        week1_detailed: successCount + "/" + week1Sessions.length,
                        spine_movements: progressionSpine.length,
                        deload_weeks: deloadWeeks
                    });
                    return [2 /*return*/, server_1.NextResponse.json({
                            success: true,
                            block_id: blockId,
                            summary: {
                                weeks: weeklyPlanRows.length,
                                sessions: sessionRows.length,
                                week1_detailed: successCount,
                                spine_movements: progressionSpine.length
                            }
                        })];
            }
        });
    });
}
exports.POST = POST;
