import { useHistory } from '@docusaurus/router';
import { useEffect } from 'react';

export default function Home() {
    const history = useHistory();

    useEffect(() => {
        history.push('/me');
    }, []);

    return;
}