import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ParticipantFields from './ParticipantFields.svelte';

describe('ParticipantFields.svelte', () => {
	it('renders the experiment-specific fields and restores submitted values', async () => {
		render(ParticipantFields, {
			requiredFields: [
				{ key: 'age', label: 'Age', type: 'number', required: true },
				{ key: 'student_id', label: 'Student ID', type: 'text', required: false }
			],
			values: { name: 'Ada', email: 'ada@example.org', field_age: '31' }
		});

		await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Ada');
		await expect.element(page.getByRole('spinbutton', { name: /Age/ })).toHaveValue(31);
		await expect.element(page.getByRole('textbox', { name: 'Student ID' })).toBeInTheDocument();
	});

	it('shows per-field errors and requires the privacy acknowledgement', async () => {
		render(ParticipantFields, {
			requiredFields: [],
			errors: { email: 'Invalid email', consent: 'You must acknowledge the privacy notice.' }
		});

		await expect.element(page.getByText('Invalid email')).toBeInTheDocument();
		await expect
			.element(page.getByText('You must acknowledge the privacy notice.'))
			.toBeInTheDocument();
		await expect.element(page.getByRole('checkbox')).toBeRequired();
	});
});
