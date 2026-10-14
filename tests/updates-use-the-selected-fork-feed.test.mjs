// A personal fork must not silently keep checking the official release feed.
import {it,expect}from 'vitest';import {githubUpdateFeed}from '../main/updater.mjs';
it('accepts a GitHub fork without changing unconfigured installations',()=>{expect(githubUpdateFeed(null)).toBe(null);expect(githubUpdateFeed({owner:'example',repo:'agentbox'})).toEqual({provider:'github',owner:'example',repo:'agentbox'});expect(()=>githubUpdateFeed({owner:'../other',repo:'repo'})).toThrow();expect(()=>githubUpdateFeed({owner:'example',repo:'https://host'})).toThrow()});
