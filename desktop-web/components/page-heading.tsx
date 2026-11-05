import type {ReactNode} from 'react';

export function PageHeading({title,description,eyebrow,aside,className=''}:{title:string;description?:string;eyebrow?:string;aside?:ReactNode;className?:string}) {
  return <header className={`page-heading ${className}`}>
    <div className="page-heading-copy">
      {eyebrow&&<p className="kicker">{eyebrow}</p>}
      <h1>{title}</h1>
      {description&&<p className="page-description">{description}</p>}
    </div>
    {aside}
  </header>;
}
