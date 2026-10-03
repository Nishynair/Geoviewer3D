import { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { CURATED_EXAMPLES } from '../../curatedExamples';

interface ExamplesButtonProps {
  onFileLoad: (name: string, rawText: string) => void;
}

export default function ExamplesButton({ onFileLoad }: ExamplesButtonProps) {
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
        {CURATED_EXAMPLES.map(({ name, rawText }) => (
          <MenuItem
            key={name}
            onClick={() => {
              onFileLoad(name, rawText);
              setAnchor(null);
            }}
          >
            {name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
