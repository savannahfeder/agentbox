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
import { listWorkItems, createItem, updateItem, createClaimRegistry } from './core/work.mjs';
import { listProductChats, readProductChat } from './core/chat.mjs';
import { lookAtPage } from './core/page.mjs';
import { WORK_ITEM_STATUSES } from '../shared/work-items.mjs';
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

export function buildTools({ holder } = {}) {
  const account = resolveAccount();
  const claims = createClaimRegistry({ holder: holder ?? `mcp-${process.pid}` });

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
      run: ({ name }) => json(fetchSkill(name, { capabilities: CAPABILITIES, missing: MISSING })),
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
      description: 'Record something that needs doing, on a product. kind and labels are free text and yours to choose; a question for the founder is a work item with kind "question". Anything you discover but cannot finish now belongs here rather than in a message, because the queue outlives this session and the message does not.',
      schema: {
        product: z.string(),
        title: z.string(),
        body: z.string().optional(),
        kind: z.string().optional(),
        labels: z.array(z.string()).optional(),
        priority: z.number().int().optional().describe('higher goes first; defaults to 0'),
        parent: z.string().optional().describe('another work item id, for a subtask'),
        runAt: z.number().int().optional().describe('epoch ms before which nothing happens with this item: it cannot be claimed and will not start. Use it when the work genuinely belongs to a later moment. A missed moment is not lost; the item simply becomes available once it passes.'),
      },
      run: ({ product, ...fields }) => json(createItem(product, fields)),
    },
    {
      name: 'claim_work_item',
      description: 'Take exclusive ownership of a work item before starting it. Pass an id for a specific one, or a filter to pull the next available item (highest priority, then oldest) from any product. Returns claimed false with the current holder if someone else has it, which is an ordinary outcome: ask for the next one instead. The claim is kept alive automatically for as long as this session runs and is released if it dies, so there is nothing to renew and nothing to clean up. If an earlier session on this row lost its claim mid-write, that write comes back with the claim, in `pending`: it never reached the row or the founder, so read it and carry what is still true into your own note or result.',
      schema: {
        product: z.string().optional(),
        id: z.string().optional(),
        filter: z.object({
          kind: z.string().optional(),
          labels: z.array(z.string()).optional(),
          product: z.string().optional(),
        }).optional(),
      },
      run: async ({ product, id, filter }) => json(await claims.claim({ product, id, filter: filter ?? (id ? null : {}) })),
    },
    {
      name: 'update_work_item',
      description: 'Report progress on an item: set status to done when it is finished, blocked when it cannot proceed until something outside it changes, and leave a note saying where things stand. Keep the summary current with problem, progress and solution, which is all a teammate sees of the thread. A worker the app started for a row ends with its answer as its last message, and the app writes that message onto the row as the result, so such a worker does not pass result for its own row: the same answer written twice is what they then read twice. A row the founder wrote (labelled founder) is closed only when they asked for it: answering them is not finishing it, so the row stays open for them. To close one, pass closeBecause with their exact words asking you to; without them the rest of the write lands and the row is left open. Writing to a row this session is not holding takes the row first, so there is no need to claim before you speak; the write is only refused when another session is genuinely on it, and that refusal is kept rather than thrown away, parked where the error says and handed to whoever takes the row next. Finishing a row hands the claim straight back, and you can still answer on it afterwards.',
      schema: {
        id: z.string(),
        status: z.enum(WORK_ITEM_STATUSES).optional(),
        result: z.string().optional(),
        note: z.string().optional(),
        priority: z.number().int().optional(),
        labels: z.array(z.string()).optional(),
        runAt: z.number().int().optional().describe('epoch ms to defer this item until; 0 clears a schedule and makes it available now'),
        closeBecause: z.string().optional().describe('only with status done on a row the founder wrote: their own words, quoted exactly from the row, asking you to close it'),
        problem: z.string().optional().describe('the thread\'s summary: what it is for, a sentence or two'),
        progress: z.string().optional().describe('the thread\'s summary: where it stands now, a sentence or two'),
        solution: z.string().optional().describe('the thread\'s summary: what done looks like, or what was done'),
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

  return {
    account,
    claims,
    tools: tools.map((t) => ({ ...t, run: guard(t.run) })),
  };
}
