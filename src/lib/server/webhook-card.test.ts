import { describe, expect, it } from 'vitest';
import { buildSummary, buildTeamsCard } from './webhook-card';
import type { SessionSummary, WebhookPayload } from './webhooks';

function session(id: string, booked: number, extra: Partial<SessionSummary> = {}): SessionSummary {
	const capacity = 6;
	const minParticipants = 3;
	return {
		id,
		startsAt: '2026-10-17T08:00:00.000Z',
		endsAt: '2026-10-17T09:00:00.000Z',
		startsAtLocal: '17. okt. 2026 10.00',
		when: `when-${id}`,
		location: 'Lab 1',
		booked,
		minParticipants,
		capacity,
		seats: `${booked}/${capacity}`,
		state: booked >= capacity ? 'full' : booked >= minParticipants ? 'ok' : 'below_minimum',
		status: 'scheduled',
		waiting: 0,
		adminUrl: `https://x.test/s/${id}`,
		...extra
	};
}

const experiment = { id: 'e', name: 'Fun Experiment', slug: 'fun', adminUrl: 'https://x.test/e' };

function payload(extra: Partial<WebhookPayload>): WebhookPayload {
	return {
		event: 'booking.created',
		occurredAt: '2026-10-16T08:00:00.000Z',
		experiment,
		upcoming: [],
		...extra
	};
}

/** All visible text in the card, flattened. */
function texts(card: unknown): string {
	return JSON.stringify(card)
		.match(/"(text|title|value)":"[^"]*"/g)!
		.join('\n');
}

describe('buildTeamsCard', () => {
	it('is a Teams-compatible 1.4 card with links', () => {
		const card = buildTeamsCard(
			payload({
				session: session('s1', 3, { milestones: ['minimum_reached'] }),
				booking: { id: 'b', source: 'public' }
			})
		);
		expect(card).toMatchObject({
			type: 'AdaptiveCard',
			version: '1.4',
			msteams: { width: 'Full' },
			actions: [
				{ type: 'Action.OpenUrl', title: 'Open session', url: 'https://x.test/s/s1' },
				{ type: 'Action.OpenUrl', title: 'Open experiment', url: 'https://x.test/e' }
			]
		});
		const t = texts(card);
		expect(t).toContain('New booking · Fun Experiment');
		expect(t).toContain('3/6');
		expect(t).toContain('Minimum reached');
		expect(t).toContain('Booked by the participant');
	});

	it('omits actions when no URLs are known', () => {
		const card = buildTeamsCard(
			payload({ experiment: { ...experiment, adminUrl: null }, upcoming: [] })
		);
		expect(card).not.toHaveProperty('actions');
	});

	it('lists upcoming sessions with state and waiting counts', () => {
		const t = texts(
			buildTeamsCard(
				payload({
					upcoming: [session('a', 1, { waiting: 2 }), session('b', 4), session('c', 6)]
				})
			)
		);
		expect(t).toContain('Upcoming sessions');
		expect(t).toContain('needs 2 more · 2 waiting');
		expect(t).toContain('will run');
		expect(t).toContain('full');
	});

	it('shows the pattern and covered sessions for a recurring preference', () => {
		const p = payload({
			event: 'preference.created',
			preference: {
				id: 'p',
				kind: 'recurring',
				pendingCount: 4,
				pattern: 'mandag 09:00–10:00',
				sessions: [session('a', 2)],
				moreCount: 3
			}
		});
		const t = texts(buildTeamsCard(p));
		expect(t).toContain('New availability');
		expect(t).toContain('mandag 09:00–10:00');
		expect(t).toContain('4 waiting to be assigned in total');
		expect(t).toContain('when-a');
		expect(t).toContain('+ 3 more');
		expect(buildSummary(p)).toBe('New availability · Fun Experiment · mandag 09:00–10:00');
	});

	it('only shows participant details when present in the payload', () => {
		const without = texts(buildTeamsCard(payload({ session: session('s', 1) })));
		expect(without).not.toContain('Email');
		const withPii = texts(
			buildTeamsCard(
				payload({
					session: session('s', 1),
					participant: { name: 'Pat', email: 'pat@x.com', manageUrl: null }
				})
			)
		);
		expect(withPii).toContain('pat@x.com');
	});
});

describe('buildSummary', () => {
	it('includes seats and milestones', () => {
		expect(
			buildSummary(
				payload({
					event: 'booking.cancelled',
					session: session('s', 2, { milestones: ['below_minimum'] })
				})
			)
		).toBe('Booking cancelled · Fun Experiment · when-s (2/6, below minimum)');
	});
});
