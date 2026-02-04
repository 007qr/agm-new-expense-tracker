import { useParams } from '@solidjs/router';

export default function ExpenseDestinationDetailsPage() {
    const params = useParams<{ id: string }>();
    return (
        <div class="p-4">
            <h1 class="text-2xl font-bold">Expense Dashboard for Destination: {params.id}</h1>
            <p>This is a dummy page for showing expenses for a single destination.</p>
        </div>
    );
}
