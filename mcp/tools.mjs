// The protocol layer: tool names, schemas, descriptions, result formatting.
//
// Everything below is a thin call into mcp/core. Keeping the two apart is what
// lets the transport be swapped later (stdio today, HTTP when the app wants it)
// without touching a line of behavior, and it means core is testable without
// speaking MCP at all.
//
// On tool descriptions: they are the only documentation the calling model ever
// reads, and it is a capable model, so they say what a thing is FOR and what it
// costs, not a procedure to follow. Where a description states a rule, the rule
// is there because the file format depends on it, not because a model cannot be
// trusted to think.

import { z } from 'zod';
import { resolveAccount } from './core/account.mjs';
import { listProducts, getProduct, createProduct, updateProduct } from './core/products.mjs';
import { listDocuments, readDocument, writeDocument } from './core/documents.mjs';
import { listSkills, fetchSkill, fetchReference } from './core/skills.mjs';
import { listWorkItems, updateItem, createClaimRegistry } from './core/work.mjs';
import { readStandingInstruction, setStandingInstruction } from './core/repeats.mjs';
import { teamPost, teamPass, teamRemember, teamSetup, teamRoster, teamPlaybook, teamMethod } from './core/teammates.mjs';
import { readTeammates, teamDir } from '../main/store/teammates-files.mjs';
import { legacyRoot } from '../main/store/project.mjs';
import { listProductChats, readProductChat } from './core/chat.mjs';
import { lookAtPage } from './core/page.mjs';
import { WORK_ITEM_STATUSES } from '../shared/work-items.mjs';
import { CONTEXT_WORDS, DONE_STEPS, DONE_STEP_WORDS, SUMMARY_WORDS } from '../shared/thread-cards.mjs';
import { AGENT_CREATION_KINDS } from '../shared/contracts.mjs';
// The descriptions below are read by every agent on every run, so the app is
// named in them from the one place it is named. They said "the app" while this
// server lived in that product's repo, which told every worker the wrong name
// for the thing it was writing to.
import { Name, possessive } from '../shared/product-name.mjs';

// What fetch_skill tells a reader it has, and what it tells them is missing.
// Stated once, here, so the header cannot claim a tool that was removed.
const CAPABILITIES = [
  'products', 'documents (read and write, any path in the product)',
  'personas and transcripts (they are documents)', 'skills', 'work items', 'past chats (read only)',
  'the standing instruction behind a repeating task, on a thread that is one of its runs',
  'the team chat and passing work to a teammate, from any thread; remembering and setting up, on a thread that is a teammate\'s run',
  'looking at a page running on this machine (look_at_page, local addresses only)',
];
const MISSING = [
  'create_database', 'deploy_app', 'connect_github', 'set_up_analytics',
  'run_creation', 'browsing the web or anything they are signed into', 'ask_user',
];

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const text = (s) => ({ content: [{ type: 'text', text: s }] });

// Any thrown error becomes a readable tool result rather than a protocol fault:
// a model that gets a sentence back can correct itself, where a transport error
// just ends the turn.
const guard = (fn) => async (args) => {
  try { return await fn(args ?? {}); } catch (err) { return { ...text(`error: ${err?.message ?? err}`), isError: true }; }
};

// `ownItem` is the row this server's session was started for, if any.
export function buildTools({ holder, ownItem = process.env.ZERO_ITEM || null, requestCloudResource = null } = {}) {
  const account = resolveAccount();
  const claims = createClaimRegistry({ holder: holder ?? `mcp-${process.pid}` });
  const hasTeam = teammatesExist(String(process.env.STORE_ACCOUNT_ID ?? '').trim() || account.accountId);
  const capabilities = hasTeam ? CAPABILITIES : CAPABILITIES.filter((c) => !c.includes('teammate'));

  const tools = [
    /* ------------------------------- products ------------------------------ */
    {
      name: 'list_products',
      description: 'Every product this founder is building, with its one-line description, the path to its code repository, how many documents it has, and how much work is open, claimed, or blocked. Start here: it is the only call that shows the whole portfolio at once, and product names from it are what every other tool accepts.',
      schema: { includeArchived: z.boolean().optional() },
      run: ({ includeArchived }) => json(listProducts({ includeArchived })),
    },
    {
      name: 'get_product',
      description: 'One product in detail. Accepts its name, slug, or id.',
      schema: { product: z.string() },
      run: ({ product }) => json(getProduct(product)),
    },
    {
      name: 'create_product',
      description: `Start a new product: creates its directory in the store with the folders and starter notes the app expects, so it is indistinguishable from one created in the app itself. repoPath points at the ordinary git checkout where this product's code lives; ${Name} stores the thinking, not the software.`,
      schema: {
        name: z.string().describe('what the founder calls it'),
        oneLiner: z.string().optional(),
        repoPath: z.string().optional().describe('absolute path to the git checkout; must already exist'),
      },
      run: ({ name, oneLiner, repoPath }) => json(createProduct(name, { oneLiner, repoPath })),
    },
    {
      name: 'update_product',
      description: 'Change a product\'s name, one-liner, repo path, or archived flag.',
      schema: {
        product: z.string(),
        name: z.string().optional(),
        oneLiner: z.string().optional(),
        repoPath: z.string().optional(),
        archived: z.boolean().optional(),
      },
      run: ({ product, ...patch }) => json(updateProduct(product, patch)),
    },

    /* ------------------------------ documents ------------------------------ */
    {
      name: 'list_documents',
      description: 'Everything readable in a product: titles, paths, kinds, and status, without opening anything. Personas, transcripts, the ICP, reports, notes, and designs are all documents at paths (personas/marcus.md, reports/first-run.md), so this one call finds any of them. Filter by pathPrefix to see a folder, or query to search titles and paths. Results marked cataloged false are files on disk that the founder\'s library index does not list, which is common and does not mean they are unimportant; they read exactly the same way.',
      schema: {
        product: z.string(),
        folder: z.string().optional(),
        kind: z.enum(AGENT_CREATION_KINDS).optional(),
        status: z.enum(['current', 'history', 'exploration']).optional(),
        pathPrefix: z.string().optional().describe('e.g. "personas/" or "reports/"'),
        query: z.string().optional(),
        catalogedOnly: z.boolean().optional().describe('only what the library index lists; omit to see everything'),
      },
      run: ({ product, ...filter }) => json(listDocuments(product, filter)),
    },
    {
      name: 'read_document',
      description: 'Read one document\'s full content, by id or by path.',
      schema: { product: z.string(), id: z.string().optional(), path: z.string().optional() },
      run: ({ product, id, path }) => json(readDocument(product, { id, path })),
    },
    {
      name: 'write_document',
      description: 'Create or update a document, and also how you retitle, move, or change the status of one. Pass content to write it; omit content to change only the metadata, which is how a rename happens without reading the whole document back first. A new document needs a path, a title, and content. The founder sees these in the app, so the title is what a person would call it, and the path says where it belongs (personas/, reports/, transcripts/, designs/). The extension is a real choice, not a formality: a .html document opens as a rendered page, a .md one as markdown, and which of those a founder can actually read is worth knowing before you pick.',
      schema: {
        product: z.string(),
        id: z.string().optional().describe('omit to create; pass to update a known document'),
        path: z.string().optional().describe('project-relative, e.g. "reports/kestrel-round-1.html" or "personas/marcus.md"'),
        title: z.string().optional(),
        kind: z.enum(AGENT_CREATION_KINDS).optional().describe('follows the path when you leave it out: .html renders as a page, anything else as markdown. Name it only when the path does not say enough (persona, transcript, canvas, app).'),
        content: z.string().optional(),
        status: z.enum(['current', 'history', 'exploration']).optional(),
      },
      run: async ({ product, ...doc }) => json(await writeDocument(product, doc)),
    },

    /* -------------------------------- skills ------------------------------- */
    {
      name: 'list_skills',
      description: `The house method: the skills the in-app agent works from, covering how to ground an ICP, build a persona panel, run interviews and user tests, design, build, report findings, and act on feedback. Worth reading before doing any of that work from scratch.`,
      schema: {},
      run: () => json(listSkills()),
    },
    {
      name: 'fetch_skill',
      description: 'One skill in full, with a short header explaining which of its tools exist here and which are your own job. These were written for the agent inside the app, so the method applies exactly and some tool names do not.',
      schema: { name: z.string() },
      run: ({ name }) => json(fetchSkill(name, { capabilities, missing: MISSING })),
    },
    {
      name: 'fetch_reference',
      description: 'A reference file that belongs to a skill, listed in that skill\'s references field. Larger than a skill and fetched separately for that reason.',
      schema: { path: z.string().describe('e.g. "design/references/craft.md"') },
      run: ({ path }) => text(fetchReference(path)),
    },

    /* ------------------------------ work items ----------------------------- */
    {
      name: 'list_work_items',
      description: 'Open work across every product at once, or one product if you name it. This is the shared queue: several agent sessions may be running against it simultaneously, so what you read here is a snapshot, and an item you intend to act on should be claimed rather than assumed free.',
      schema: {
        product: z.string().optional(),
        status: z.enum(WORK_ITEM_STATUSES).optional(),
        kind: z.string().optional(),
        labels: z.array(z.string()).optional(),
        includeDone: z.boolean().optional(),
      },
      run: (args) => json(listWorkItems(args)),
    },
    {
      name: 'create_work_item',
      description: 'Record something that needs doing, on a product. kind and labels are free text and yours to choose; a question for the person you work for is a work item with kind "question". ONE JOB IS ONE THREAD: ask how many answers you need rather than how many things you found, because every extra thread is one more thing they must read, rank and either start or close. Twenty findings they would answer in one breath are one thread, and one PR is one thread. Something you discovered but cannot finish usually belongs in the thread you are already on, under what is left to do, and work that can run in parallel goes to subagents inside this thread, not to new threads. When it really is its own job, file it under the thread it came from with parent.',
      schema: {
        product: z.string(),
        title: z.string(),
        body: z.string().optional(),
        kind: z.string().optional(),
        labels: z.array(z.string()).optional(),
        priority: z.number().int().optional().describe('higher goes first; defaults to 0'),
        parent: z.string().optional().describe('another work item id: the thread this one came out of. It decides where the filing lands. With a parent it is a proposal, waiting in Later and drawn on that thread with one press, so they answer it where the conversation already is; with none it is a row of its own in their inbox, addressed to them, whatever it says.'),
        runAt: z.number().int().optional().describe('epoch ms before which nothing happens with this item: it cannot be claimed and will not start. Use it when the work genuinely belongs to a later moment. A missed moment is not lost; the item simply becomes available once it passes.'),
      },
      run: ({ product, ...fields }) => json(claims.file(product, fields)),
    },
    {
      name: 'claim_work_item',
      description: 'Take exclusive ownership of a work item before starting it. Pass an id for a specific one, or a filter to pull the next available item (highest priority, then oldest) from any product. With neither, a session started for a work item claims that item. Returns claimed false with the current holder if someone else has it, which is an ordinary outcome: ask for the next one instead. The claim is kept alive automatically for as long as this session runs and is released if it dies, so there is nothing to renew and nothing to clean up. If an earlier session on this row lost its claim mid-write, that write comes back with the claim, in `pending`: it never reached the row or the founder, so read it and carry what is still true into your own note or result.',
      schema: {
        product: z.string().optional(),
        id: z.string().optional(),
        filter: z.object({
          kind: z.string().optional(),
          labels: z.array(z.string()).optional(),
          product: z.string().optional(),
        }).optional(),
      },
      // A bare call from a session started for a row means that row, not the oldest open one anywhere.
      run: async ({ product, id, filter }) => {
        if (!id && !filter && ownItem) return json(await claims.claim({ id: ownItem }));
        return json(await claims.claim({ product, id, filter: filter ?? (id ? null : {}) }));
      },
    },
    {
      name: 'update_work_item',
      description: 'Report progress on an item: set status to done when it is finished, blocked when it cannot proceed until something outside it changes, and leave a note saying where things stand. Keep the summary current with problem (shown as Context) and progress (shown as the Done list), which is all a teammate sees of the thread. A worker the app started for a row ends with its answer as its last message, and the app writes that message onto the row as the result, so such a worker does not pass result for its own row: the same answer written twice is what they then read twice. A row the founder wrote (labelled founder) is closed only when they asked for it: answering them is not finishing it, so the row stays open for them. To close one, pass closeBecause with their exact words asking you to; without them the rest of the write lands and the row is left open. A runAt you set holds workers off but keeps the row in their inbox; when they asked for it to be put off ("remind me Friday"), pass deferBecause with their exact words and it leaves their inbox until then. Writing to a row this session is not holding takes the row first, so there is no need to claim before you speak; the write is only refused when another session is genuinely on it, and that refusal is kept rather than thrown away, parked where the error says and handed to whoever takes the row next. Finishing a row hands the claim straight back, and you can still answer on it afterwards.',
      schema: {
        id: z.string(),
        status: z.enum(WORK_ITEM_STATUSES).optional(),
        result: z.string().optional(),
        note: z.string().optional(),
        priority: z.number().int().optional(),
        labels: z.array(z.string()).optional(),
        runAt: z.number().int().optional().describe('epoch ms to defer this item until; 0 clears a schedule and makes it available now'),
        closeBecause: z.string().optional().describe('only with status done on a row the founder wrote: their own words, quoted exactly from the row, asking you to close it'),
        deferBecause: z.string().optional().describe('only with runAt on a row the founder wrote: their own words, quoted exactly from the row, asking for it to be put off or to be reminded later. Without them the row stays in their inbox'),
        problem: z.string().optional().describe(`the summary's CONTEXT: a few plain sentences, ${CONTEXT_WORDS} words at most, about the whole thread for someone who has forgotten it: what the thread is for, then where it stands overall. Never only the latest round, which the answer gives`),
        progress: z.string().optional().describe(`the summary's DONE list: the steps taken so far, one per line, oldest first and newest last, ${DONE_STEPS} lines at most of ${DONE_STEP_WORDS} words each. Send the whole list each time; it replaces the last one. Every line is a step that FINISHED: one you are about to take goes on after it happens, never before`),
        solution: z.string().optional().describe(`no longer shown; leave it out (older threads may still carry one, ${SUMMARY_WORDS} words at most)`),
        blockedBy: z.array(z.string()).optional().describe('ids of threads this one waits on'),
        blocks: z.array(z.string()).optional().describe('ids of threads that wait on this one'),
      },
      run: async ({ id, ...patch }) => json(await claims.update(id, patch)),
    },
    {
      name: 'release_work_item',
      description: 'Hand an item back unfinished so another session can take it. Worth doing when you find it is not what you thought, or belongs to work you are not equipped for; otherwise it stays held until this session ends.',
      schema: { id: z.string() },
      run: ({ id }) => json(claims.release(id)),
    },

    /* --------------------------- repeating tasks --------------------------- */
    // The rule itself, for the session standing on one of its runs. A run that
    // edits its own body edits a copy, and a memory note is kept per task
    // folder while every run gets a new one, so neither reaches tomorrow.
    {
      name: 'read_repeating_task',
      description: 'The standing instruction behind this run, if this thread is one run of a repeating task: the words every run after this one is briefed with, plus the schedule and when it next runs. Read it before changing it; set_repeating_task replaces the whole instruction.',
      schema: {},
      run: () => json(readStandingInstruction()),
    },
    {
      name: 'set_repeating_task',
      description: 'Change the standing instruction behind this run, so the next run and every one after it is briefed with the new words. This is what to use when the person tells you, on a run, how the task should go from now on ("if there is nothing new, don\'t bother me") — they should not have to go and edit it themselves, and a memory note will not do it, because every run gets a new task folder. Send the WHOLE instruction, not the part you are adding: read_repeating_task first, then send it back with their change in it. Only the words are yours: the hour, the day and which coding agent runs it stay on their own screen, and it only works on a thread that is a run of a repeating task.',
      schema: {
        instruction: z.string().describe('the whole standing instruction, as the person would have typed it'),
      },
      run: ({ instruction }) => json(setStandingInstruction({ instruction })),
    },

    /* ------------------------------- teammates ------------------------------ */
    // On a teammate's run, the teammate speaks; on any other thread, the person
    // does, because they asked. Which comes from the run, never an argument.
    {
      name: 'team_post',
      description: 'Say something in the team chat: as the teammate this run belongs to, or, on any other thread, for the person when they ask you to tell a teammate something. The person and every teammate read it, so say "you" to the person, never "the person". From a teammate, naming another in `to` or with @Name tells them: they read it on their next turn, and it wakes nobody. To have a teammate act, use team_pass. For the person, naming a teammate wakes them. Keep it short and plain. Add up to four short `options` when asking the person something they can answer in a tap.',
      schema: {
        text: z.string().describe('what to say, one to three sentences'),
        to: z.array(z.string()).optional().describe('names of teammates it is for'),
        options: z.array(z.string()).optional().describe('short answers the person can tap, when asking them a question'),
      },
      run: ({ text: words, to, options }) => json(teamPost({ text: words, to, options })),
    },
    {
      name: 'team_pass',
      description: 'Hand a piece of work to a teammate whose job it is, or hand an answer back to a teammate waiting on you. It goes to the thread they already have on this work, or starts one, and shows in the team chat. From a teammate it waits for the person\'s yes before they start, unless the person told the receiver it need not. On a thread that is not a teammate\'s run, use it when the person asks you to give something to one of their teammates (call team_roster first to see who is on the team). Put everything they need in the details: steps, files, links, what done looks like.',
      schema: {
        to: z.string().describe('the teammate\'s name'),
        title: z.string().describe('the work, in a short line'),
        details: z.string().describe('everything they need to do it'),
        project: z.string().optional().describe('the project the work is in, when it is not the teammate\'s own (from another thread it defaults to that thread\'s)'),
      },
      run: ({ to, title, details, project }) => json(teamPass({ to, title, details, project })),
    },
    {
      name: 'team_remember',
      description: 'Keep a standing preference the person stated ("from now on", "always", "never", "I prefer") in a few words, in their terms. The person sees it in the team chat and can undo it. If you have a method file, put it there too: your method is what every later run reads.',
      schema: { text: z.string().describe('the preference, in a few words') },
      run: ({ text: words }) => json(teamRemember({ text: words })),
    },
    {
      name: 'team_playbook',
      description: 'Keep a lesson about how the person likes a kind of work done ("open videos on the product, never a logo") in the playbook of that title ("How you like videos made"), made if new, with the thread you are on as where it came from. Every teammate that reads the playbook is briefed with it. Leave out lesson to start reading a playbook another teammate wrote.',
      schema: {
        playbook: z.string().describe('its title, like "How you write posts"'),
        lesson: z.string().optional().describe('the lesson, one sentence in their terms'),
      },
      run: ({ playbook, lesson }) => json(teamPlaybook({ playbook, lesson })),
    },
    {
      name: 'team_method',
      description: 'Write your method, the one file every run of yours reads whole: send text to write all of it, or old (one passage exactly as it reads now) and new (what replaces it) to change one part. Use it when you cannot edit the method file with your own tools. The version it replaces is kept.',
      schema: {
        text: z.string().optional().describe('your whole method'),
        old: z.string().optional().describe('one passage of it, exactly as it reads now'),
        new: z.string().optional().describe('what replaces that passage'),
      },
      run: (args) => json(teamMethod(args)),
    },
    {
      name: 'team_setup',
      description: 'Set or change who you are as a teammate: your name (your role, like Marketing lead), role, job (as long as it needs, in plain words to yourself), goal, how the goal is counted, what needs the person\'s yes first (a statement, never a question), what you do on your own (duties: a list, each { what, every: day|weekday|week, at: ["09:00", "15:00"], on: 0-6 for weekly } or { what, after: "ship", most: runs a week }, with tell: when to bring the person in; the list you send replaces the old one), which coding agent runs you when the person said (runsOn: claude or codex), whether work other teammates hand you waits for the person\'s yes (handoffsNeedYes, true unless they said otherwise), and a date your duties do not wake you before when they say to pause (pausedUntil: YYYY-MM-DD, or null to end it). A new teammate calls it to set itself up, and with ready true when it is set.',
      schema: {
        name: z.string().optional(),
        role: z.string().optional(),
        job: z.string().optional(),
        goal: z.string().optional(),
        counted: z.string().optional(),
        asksFirst: z.string().optional(),
        duties: z.array(z.object({
          what: z.string(),
          every: z.enum(['day', 'weekday', 'week']).optional(),
          at: z.union([z.string(), z.array(z.string())]).optional(),
          on: z.number().int().optional(),
          after: z.enum(['ship']).optional(),
          most: z.number().int().optional(),
          tell: z.string().optional(),
        })).optional(),
        runsOn: z.enum(['claude', 'codex']).optional(),
        handoffsNeedYes: z.boolean().optional(),
        pausedUntil: z.string().nullable().optional(),
        ready: z.boolean().optional(),
      },
      run: (args) => json(teamSetup(args)),
    },
    {
      name: 'team_roster',
      description: 'The person\'s teammates (agents with standing jobs) with their role and job, and the last twenty things said in the team chat. Works on any thread.',
      schema: {},
      run: () => json(teamRoster()),
    },

    /* -------------------------------- chats -------------------------------- */
    {
      name: 'list_chats',
      description: `Past conversations between the founder and ${possessive} own in-app agent, for one product, newest first.`,
      schema: { product: z.string() },
      run: ({ product }) => json(listProductChats(product)),
    },
    {
      name: 'read_chat',
      description: 'The recent end of one past conversation. Useful when something about a product looks deliberate and undocumented: the reason is often in here rather than in any document. Read-only; this server never writes to a conversation the app owns.',
      schema: {
        product: z.string(),
        chatId: z.string().optional().describe('defaults to the most recent chat'),
        limit: z.number().int().optional().describe('how many messages from the end; default 100'),
      },
      run: ({ product, chatId, limit }) => json(readProductChat(product, { chatId, limit })),
    },

    /* --------------------------------- pages ------------------------------- */
    // LOOKING AT WHAT YOU BUILT, WHICH IS THE HALF OF A BROWSER THAT IS ACTUALLY
    // MISSING (w-5ebf7bf7bb). The terminal clients this app keeps parity with
    // mostly ship a browser now. A worker driving a browser of OURS is approved;
    // a worker driving the one she is signed into never will be, because that
    // one holds her logins and her cookies, and it is banned in CLAUDE.md with a
    // test behind it. Loopback only here, because a worker that can fetch any
    // address can post anything it has read to any address.
    {
      name: 'look_at_page',
      description: `Open a page running on this machine, photograph it, and read its words back. For looking at what you just built: start the app, look at it, then name the picture in your message so they see what you saw. Local addresses only, so it cannot reach the web or anything they are signed into. Returns the picture's path inside the product, plus the page's title and visible text.`,
      schema: {
        product: z.string(),
        url: z.string().describe('a local address, as in http://localhost:3000/'),
        width: z.number().int().optional().describe('viewport width; default 1280'),
        height: z.number().int().optional().describe('viewport height; default 900'),
      },
      run: async ({ product, url, width, height }) => json(await lookAtPage({ product, url, width, height })),
    },
  ];

  if (typeof requestCloudResource === 'function') tools.push({
    name: 'request_cloud_resource',
    description: 'Fetch a missing file, folder or installed skill from this thread’s computer without moving the conversation there. A file or folder is any path under this task checkout or the account’s documents, other products’ folders included: relative with a scope, or written out in full (`~/…` or absolute) with no scope. Skills use their installed name. Delivered resources get a separate scratch path, preserving cloud edits. Returns delivered, folder (its files, to ask for one by one), denied, not_found, too_large, or unavailable, with the reason. A delivered skill includes its scripts and references; read its returned SKILL.md. If the request names what could not be delivered, end the turn with the hand-back line rather than building around a guess; otherwise continue and explain what is missing.',
    schema: {
      kind: z.enum(['file', 'skill']),
      path: z.string().describe('file or folder path (relative, ~/…, or absolute), or installed skill name'),
      scope: z.enum(['task', 'documents', 'account']).optional().describe('for a relative file path: this task, this product\'s documents, or the account\'s documents; omitted for a full path or a skill'),
    },
    run: async (args) => json(await requestCloudResource(args)),
  });

  // Teammates are an alpha feature: their tools are offered once there is a
  // teammate to talk to, which is never while the feature is off.
  return {
    account,
    claims,
    tools: tools.filter((t) => hasTeam || !t.name.startsWith('team_')).map((t) => ({ ...t, run: guard(t.run) })),
  };
}

function teammatesExist(accountId) {
  try { return readTeammates(teamDir(legacyRoot(), accountId)).length > 0; } catch { return false; }
}
