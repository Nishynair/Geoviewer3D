import { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { CURATED_EXAMPLES, type CuratedDemo } from '../../curatedExamples';

interface ExamplesButtonProps {
  onFileLoad: (name: string, rawText: string) => void;
  onDemoLoad: (demo: CuratedDemo) => void;
}

export default function ExamplesButton({ onFileLoad, onDemoLoad }: ExamplesButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Button
        color="inherit"
        aria-haspopup="menu"
        aria-expanded={anchor !== null ? 'true' : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        Examples
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {CURATED_EXAMPLES.map(({ name, rawText, demo }) => (
          <MenuItem
            key={name}
            onClick={() => {
              if (demo) onDemoLoad(demo);
              else onFileLoad(name, rawText);
              setAnchor(null);
            }}
          >
            {demo?.name ?? name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
