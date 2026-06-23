import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import KanbanBoard from '../KanbanBoard';

// Smoke tests for the in-app kanban board. `initialData` is injected so the component skips the
// async /api/kanban load (no dev server in jsdom). Drag persistence falls back to localStorage,
// which jsdom provides.
const sampleBoard = () => ({
    project: 'music-melody-trainer',
    columns: [
        { id: 'todo', title: 'Req' },
        { id: 'done', title: 'Done' },
    ],
    tasks: [
        { id: 1, title: 'Fix tuplet bug', status: 'todo', priority: 'high', tags: ['bug'], rank: 1000 },
        { id: 2, title: 'Ship carousel', status: 'done', priority: 'medium', tags: ['feature'], rank: 1000 },
    ],
});

describe('KanbanBoard', () => {
    it('renders the columns and cards from the data', () => {
        const { getByText } = render(<KanbanBoard onBack={() => {}} initialData={sampleBoard()} />);
        expect(getByText('Req')).toBeTruthy();
        expect(getByText('Done')).toBeTruthy();
        expect(getByText('Fix tuplet bug')).toBeTruthy();
        expect(getByText('Ship carousel')).toBeTruthy();
    });

    it('calls onBack when the back button is clicked', () => {
        const onBack = vi.fn();
        const { getByText } = render(<KanbanBoard onBack={onBack} initialData={sampleBoard()} />);
        fireEvent.click(getByText('← Terug'));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('moves a card to another column on drag-and-drop', () => {
        const { getByText, container } = render(<KanbanBoard onBack={() => {}} initialData={sampleBoard()} />);
        const card = getByText('Fix tuplet bug').closest('.kanban-card');
        const columns = container.querySelectorAll('.kanban-column');
        const doneColumn = columns[1]; // second column = Done

        // Each column header shows its card count; Req starts at 1, Done at 1.
        const counts = () => [...container.querySelectorAll('.kanban-col-count')].map((e) => e.textContent);
        expect(counts()).toEqual(['1', '1']);

        fireEvent.dragStart(card);
        fireEvent.drop(doneColumn);

        // After moving the todo card into Done: Req 0, Done 2.
        expect(counts()).toEqual(['0', '2']);
    });
});
