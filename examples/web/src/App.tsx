import {type ReactNode, useEffect, useState} from "react";
import {createZip, type Entry, type EntryContentMap, type EntryType, type TypedEntry} from "./createZip";

interface State {
  readonly nextId: number;
  readonly entries: readonly Entry[];
  readonly pending: boolean;
  readonly progress: null | StateProgress;
  readonly result: Blob | null;
}

interface StateProgress {
  readonly bytesWritten: number;
  readonly totalBytes: number;
}

type StateUpdater = (state: State) => State;
type SetState = (updater: StateUpdater) => void;

const initialState: State = {
  nextId: 2,
  entries: [
    {
      id: 0,
      type: "text",
      path: "hello.txt",
      content: "Hello world!",
      compressed: true,
    },
    {
      id: 1,
      type: "file",
      path: "big.mp4",
      content: null,
      compressed: false,
    },
    {
      id: 2,
      type: "url",
      path: "big.mp4",
      content: "/file/.local/big_buck_bunny_1080p_h264.mov",
      compressed: false,
    },
  ],
  pending: false,
  progress: null,
  result: null,
}

function createEntry<Type extends EntryType>(id: number, type: Type, content: EntryContentMap[Type]): TypedEntry<Type> {
  return {id, type, path: `entry-${id}`, content, compressed: true};
}

const addTextEntry: StateUpdater = (state) => ({
  ...state,
  nextId: state.nextId + 1,
  entries: [...state.entries, createEntry(state.nextId, "text", "")],
});

const addFileEntry: StateUpdater = (state) => ({
  ...state,
  nextId: state.nextId + 1,
  entries: [...state.entries, createEntry(state.nextId, "file", null)],
});

const addUrlEntry: StateUpdater = (state) => ({
  ...state,
  nextId: state.nextId + 1,
  entries: [...state.entries, createEntry(state.nextId, "url", "")],
});

function setEntry(id: number, newEntry: Entry): StateUpdater {
  return (state) => ({
    ...state,
    entries: state.entries.map((entry) => {
      return entry.id === id ? newEntry : entry;
    }),
  });
}

function remove(id: number): StateUpdater {
  return (state) => ({
    ...state,
    entries: state.entries.filter((entry) => entry.id !== id),
  })
}

function useBlobUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
    } else {
      const newUrl = URL.createObjectURL(blob);
      setUrl(newUrl);
      return () => {
        URL.revokeObjectURL(newUrl);
      };
    }
  }, [blob]);
  return url;
}

export default function App() {
  const [state, setState] = useState<State>(initialState);
  const resultUrl = useBlobUrl(state.result);

  return (
    <table>
      <thead>
      <tr>
        <th>Path</th>
        <th>Value</th>
        <th>Compressed</th>
        <th></th>
      </tr>
      </thead>
      <tbody>
      {state.entries.map((entry) => {
        switch (entry.type) {
          case "text":
          case "url":
            return (
              <EntryRow entry={entry} setState={setState}>
                <input type="text" value={entry.content} onChange={(event) => {
                  setState(setEntry(entry.id, {...entry, content: event.target.value}));
                }}/>
              </EntryRow>
            );
          case "file":
            return (
              <EntryRow entry={entry} setState={setState}>
                <input type="file" onChange={(event) => {
                  setState(setEntry(entry.id, {...entry, content: event.target.files![0]}));
                }}/>
              </EntryRow>
            );
        }
      })}
      </tbody>
      <tfoot>
      <tr>
        <td colSpan={3}>
          <div>
            <button type="button" onClick={() => setState(addTextEntry)}>Add Text entry</button>
            <button type="button" onClick={() => setState(addFileEntry)}>Add File entry</button>
            <button type="button" onClick={() => setState(addUrlEntry)}>Add Url entry</button>
            <button type="button" onClick={async () => {
              setState((state) => ({...state, pending: true, result: null}));
              const result = await createZip(state.entries, (bytesWritten, totalBytes) => {
                setState((state) => ({
                  ...state,
                  progress: {bytesWritten, totalBytes},
                }));
              });
              setState((state) => ({...state, pending: false, progress: null, result}));
            }}>Create
            </button>
          </div>
          {state.pending && (
            <div>
              <p>Creating zip...</p>
            </div>
          )}
          {state.progress && (
            <div>
              <p>Progress: {state.progress.bytesWritten} / {state.progress.totalBytes}</p>
              <progress value={state.progress.bytesWritten} max={state.progress.totalBytes}/>
            </div>
          )}
          {resultUrl && (
            <div>
              <a href={resultUrl} download="hello.zip">Download hello.zip</a>
            </div>
          )}
        </td>
      </tr>
      </tfoot>
    </table>
  );
}

function EntryRow({entry, setState, children}: { entry: Entry, setState: SetState, children: ReactNode }) {
  return (
    <tr>
      <td>
        <input type="text" value={entry.path} onChange={(event) => {
          setState(setEntry(entry.id, {...entry, path: event.target.value}));
        }}/>
      </td>
      <td>
        {children}
      </td>
      <td>
        <input type="checkbox" checked={entry.compressed} onChange={(event) => {
          setState(setEntry(entry.id, {...entry, compressed: event.target.checked}));
        }}/>
      </td>
      <td>
        <button type="button" onClick={() => {
          setState(remove(entry.id))
        }}>Remove
        </button>
      </td>
    </tr>
  );
}
