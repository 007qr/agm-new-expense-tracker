import { useParams } from '@solidjs/router';

export default function LedgerPage() {
    const params = useParams<{ id: string }>();
    return (
        <>
            <h1 class="text-4xl text-white">Destination #{params.id.slice(0, 8)}</h1>
        </>
    );
}
