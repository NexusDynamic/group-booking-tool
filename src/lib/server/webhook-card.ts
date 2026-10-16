import type { Milestone, SessionSummary, WebhookEvent, WebhookPayload } from './webhooks';

/**
 * Presentation for webhook payloads: a one-line `summary` and a Microsoft
 * Teams Adaptive Card, so a Power Automate flow can post the card as-is
 * instead of assembling a message from fields.
 *
 * Card schema 1.4 (what Teams' "Post card in a chat or channel" accepts);
 * rows are ColumnSets because `Table` needs 1.5. Pure: no DB or env access.
 */

type Element = Record<string, unknown>;
type Color = 'Default' | 'Good' | 'Warning' | 'Attention' | 'Accent';

const HEADLINES: Record<WebhookEvent, { icon: string; title: string; color: Color }> = {
	'booking.created': { icon: '✅', title: 'New booking', color: 'Good' },
	'booking.cancelled': { icon: '❌', title: 'Booking cancelled', color: 'Attention' },
	'preference.created': { icon: '🗓️', title: 'New availability', color: 'Accent' },
	'preference.withdrawn': { icon: '↩️', title: 'Availability withdrawn', color: 'Default' },
	'session.cancelled': { icon: '🚫', title: 'Session cancelled', color: 'Attention' },
	'webhook.test': { icon: '🧪', title: 'Test notification', color: 'Default' }
};

const MILESTONES: Record<Milestone, { text: string; color: Color }> = {
	minimum_reached: { text: '🎉 Minimum reached: the session will run', color: 'Good' },
	full: { text: '🔒 Session is now full: confirm with participants', color: 'Accent' },
	below_minimum: {
		text: '⚠️ Dropped below the minimum: recruit more or consider cancelling',
		color: 'Warning'
	},
	no_longer_full: { text: 'A seat has opened up', color: 'Default' }
};

function stateLabel(s: SessionSummary): { text: string; color: Color } {
	if (s.status === 'cancelled') return { text: '✖ cancelled', color: 'Attention' };
	switch (s.state) {
		case 'full':
			return { text: '● full', color: 'Accent' };
		case 'ok':
			return { text: '✓ will run', color: 'Good' };
		default:
			return { text: `⚠ needs ${s.minParticipants - s.booked} more`, color: 'Warning' };
	}
}

function text(value: string, props: Element = {}): Element {
	return { type: 'TextBlock', text: value, wrap: true, ...props };
}

function column(items: Element[], width: string = 'auto'): Element {
	return { type: 'Column', width, items, verticalContentAlignment: 'Center' };
}

/** One compact line: when · seats · state (· waiting). */
function sessionRow(s: SessionSummary, opts: { highlight?: boolean; showWaiting?: boolean } = {}) {
	const state = stateLabel(s);
	const weight = opts.highlight ? 'Bolder' : 'Default';
	const extra = opts.showWaiting && s.waiting > 0 ? ` · ${s.waiting} waiting` : '';
	return {
		type: 'ColumnSet',
		spacing: 'Small',
		columns: [
			column([text(s.when, { weight })], 'stretch'),
			column([text(s.seats, { weight: 'Bolder' })]),
			column([text(`${state.text}${extra}`, { color: state.color, size: 'Small' })])
		]
	};
}

function sessionDetail(s: SessionSummary): Element[] {
	const state = stateLabel(s);
	const where = s.location ? ` · ${s.location}` : '';
	const blocks: Element[] = [
		{
			type: 'ColumnSet',
			columns: [
				column([text(`${s.when}${where}`, { weight: 'Bolder' })], 'stretch'),
				column([text(s.seats, { weight: 'Bolder', size: 'Large', color: state.color })])
			]
		},
		text(`${state.text} (min ${s.minParticipants}, max ${s.capacity})`, {
			color: state.color,
			size: 'Small',
			spacing: 'None'
		})
	];
	for (const m of s.milestones ?? []) {
		blocks.push(text(MILESTONES[m].text, { color: MILESTONES[m].color, weight: 'Bolder' }));
	}
	return blocks;
}

function heading(value: string): Element {
	return text(value, { weight: 'Bolder', separator: true, spacing: 'Medium' });
}

export function buildTeamsCard(p: WebhookPayload): Record<string, unknown> {
	const head = HEADLINES[p.event];
	const body: Element[] = [
		text(`${head.icon} ${head.title} · ${p.experiment.name}`, {
			size: 'Large',
			weight: 'Bolder',
			color: head.color
		})
	];

	if (p.session) {
		body.push(...sessionDetail(p.session));
		if (p.booking) {
			const by =
				p.event === 'booking.cancelled'
					? 'Cancelled by the participant'
					: p.booking.source === 'admin'
						? 'Assigned by a researcher from availability'
						: 'Booked by the participant';
			body.push(text(by, { isSubtle: true, size: 'Small' }));
		}
		if (p.event === 'session.cancelled') {
			const n = p.session.booked;
			body.push(
				n === 0
					? text('Nobody was booked', { isSubtle: true })
					: text(`⚠️ ${n} participant${n === 1 ? ' was' : 's were'} booked: let them know`, {
							color: 'Warning',
							weight: 'Bolder'
						})
			);
			if (p.affectedParticipants?.length) {
				body.push({
					type: 'FactSet',
					facts: p.affectedParticipants.map((a) => ({ title: a.name, value: a.email }))
				});
			}
		}
	}

	if (p.preference) {
		const pr = p.preference;
		const what =
			pr.pattern ??
			(pr.sessions.length + pr.moreCount === 1
				? 'Selected 1 session'
				: `Selected ${pr.sessions.length + pr.moreCount} sessions`);
		body.push(
			heading(p.session ? 'Availability' : what),
			...(p.session ? [text(what)] : []),
			text(`${pr.pendingCount} waiting to be assigned in total`, {
				isSubtle: true,
				size: 'Small',
				spacing: 'None'
			})
		);
		if (pr.sessions.length === 0) {
			body.push(text('No matching upcoming sessions', { isSubtle: true }));
		}
		for (const s of pr.sessions) body.push(sessionRow(s));
		if (pr.moreCount > 0) body.push(text(`+ ${pr.moreCount} more`, { isSubtle: true }));
	}

	if (p.participant) {
		const facts = [
			{ title: 'Name', value: p.participant.name },
			{ title: 'Email', value: p.participant.email }
		];
		if (p.participant.manageUrl) {
			facts.push({ title: 'Manage link', value: `[open](${p.participant.manageUrl})` });
		}
		body.push({ type: 'FactSet', separator: true, facts });
	}

	body.push(heading('Upcoming sessions'));
	if (p.upcoming.length === 0) body.push(text('No upcoming sessions', { isSubtle: true }));
	for (const s of p.upcoming) {
		body.push(sessionRow(s, { highlight: s.id === p.session?.id, showWaiting: true }));
	}

	const actions: Element[] = [];
	if (p.session?.adminUrl) {
		actions.push({ type: 'Action.OpenUrl', title: 'Open session', url: p.session.adminUrl });
	}
	if (p.experiment.adminUrl) {
		actions.push({ type: 'Action.OpenUrl', title: 'Open experiment', url: p.experiment.adminUrl });
	}

	return {
		type: 'AdaptiveCard',
		$schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
		version: '1.4',
		msteams: { width: 'Full' },
		body,
		...(actions.length > 0 ? { actions } : {})
	};
}

/** e.g. "New booking · Fun Experiment · fre. 17. okt. 10.00 (3/6, minimum reached)" */
export function buildSummary(p: WebhookPayload): string {
	const parts = [HEADLINES[p.event].title, p.experiment.name];
	if (p.session) {
		const notes = [
			p.session.seats,
			...(p.session.milestones ?? []).map((m) => m.replace(/_/g, ' '))
		];
		parts.push(`${p.session.when} (${notes.join(', ')})`);
	} else if (p.preference) {
		const n = p.preference.sessions.length + p.preference.moreCount;
		parts.push(p.preference.pattern ?? `${n} session${n === 1 ? '' : 's'} selected`);
	}
	return parts.join(' · ');
}
