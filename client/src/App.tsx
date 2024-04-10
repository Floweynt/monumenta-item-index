import {ItemResponse} from "@shared/api";
import {useEffect, useState} from "react";
import {MCItem} from "./components/MCItem";

function App() {
    const [data, setData] = useState<ItemResponse | null>(null);

    useEffect(() => {
        fetch("/api/diff")
            .then(response => response.json())
            .then(json => setData(json))
            .catch(error => console.error(error));
    }, []);

    if (data === null)
        return (<div>Loading</div>);

    return (
        <div>
            {
                data.items.map(u => (<>
                    <MCItem item={u[0]}></MCItem>
                    <MCItem item={u[1]}></MCItem>
                    <br></br>
                    <br></br>
                </>))
            }
        </div>
    );
}

export default App;
