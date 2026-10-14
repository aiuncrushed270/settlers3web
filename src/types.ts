// one entry of maps.json (snapshot of the settlers-united s3-maps index)
export interface MapInfo
{
	n: string;  // name
	a: string;  // author
	p: number;  // max players
	s: number;  // map size
	g: string;  // default goods: LG | MG | HG
	d: string;  // publication date dd.mm.yyyy
	u: string;  // path of the .map file in the s3-maps repository
}
