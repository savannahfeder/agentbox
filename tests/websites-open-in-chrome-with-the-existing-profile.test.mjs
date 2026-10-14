// Website links must reach the existing browser rather than an empty Electron session.
import {it,expect,vi} from 'vitest';
import {openWebsite} from '../main/open-website.mjs';
it('opens a Mac website in the existing Chrome without a profile override',async()=>{
 const execute=vi.fn().mockResolvedValue({});
 await openWebsite('https://example.com/page',{platform:'darwin',execute});
 expect(execute).toHaveBeenCalledWith('/usr/bin/open',['-a','Google Chrome','https://example.com/page'],{timeout:10000});
});
it('rejects unsafe protocols and embedded credentials without launching anything',async()=>{
 const execute=vi.fn();
 for(const url of ['file:///etc/passwd','javascript:alert(1)','https://name:secret@example.com/'])await expect(openWebsite(url,{platform:'darwin',execute})).rejects.toThrow();
 expect(execute).not.toHaveBeenCalled();
});
it('reports a missing browser and retains the system opener on other platforms',async()=>{
 await expect(openWebsite('https://example.com/',{platform:'darwin',execute:vi.fn().mockRejectedValue(Error('Chrome unavailable'))})).rejects.toThrow('Chrome unavailable');
 const external=vi.fn().mockResolvedValue();await openWebsite('https://example.com/',{platform:'linux',external});expect(external).toHaveBeenCalledWith('https://example.com/');
});
