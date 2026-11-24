#define _POSIX_C_SOURCE 200809L
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include <time.h>
#include <pthread.h>
#include <errno.h>
#include <assert.h>
#define TOP 32
#define SPACE (UINT64_C(1)<<32)
typedef struct {int ds,flip,lead,tail,st,nrun,n11,len;} Word;
typedef struct {int st,d,l,tail,primary,count,n11,len;} Path;
typedef struct {int count,n11,len;} Score;
static Word mainw[1024],subw[352],syncw[2][2][8];
static const uint32_t syncbits[2][2][8]={{{0x12440011,0x04040011,0x10040011,0x08040011,0x20040011,0x22440011,0x24840011,0x24440011},{0x12040011,0x04440011,0x10440011,0x08440011,0x20440011,0x22040011,0x20840011,0x24040011}},{{0x92040011,0x84440011,0x90440011,0x82440011,0x88440011,0x89040011,0x90840011,0x88840011},{0x92440011,0x84040011,0x90040011,0x82040011,0x88040011,0x81040011,0x80840011,0x80440011}}};
static Word makeword(uint32_t w,int n,int st){Word t={.flip=1,.lead=-1,.st=st};int prev=-1;for(int i=0;i<n;i++){if((w>>(n-1-i))&1){t.flip=-t.flip;if(prev<0)t.lead=i;else {int gap=i-prev;t.nrun++;t.n11+=gap==11;t.len+=gap;}prev=i;}t.ds+=t.flip;}t.tail=n-1-prev;assert(prev>=0);return t;}
static void load(const char *file){const char *abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";FILE *f=fopen(file,"r");if(!f){perror(file);exit(1);}for(int i=0;i<1376;i++){unsigned v=0;for(int j=0;j<3;j++){int c=fgetc(f);const char *p=c==EOF?NULL:strchr(abc,c);if(!p||!*p){fprintf(stderr,"Invalid table at %d\n",i);exit(1);}v=(v<<6)|(unsigned)(p-abc);}Word w=makeword(v>>2,16,(v&3)+1);if(i<1024)mainw[i]=w;else subw[i-1024]=w;}int c;while((c=fgetc(f))!=EOF)if(c!='\n'&&c!='\r'){fprintf(stderr,"Extra table data\n");exit(1);}fclose(f);for(int g=0;g<2;g++)for(int a=0;a<2;a++)for(int j=0;j<8;j++)syncw[g][a][j]=makeword(syncbits[g][a][j],32,1);}
static inline Path start(Path in,const Word *w,int primary){return (Path){.st=1,.d=in.d+in.l*w->ds,.l=in.l*w->flip,.tail=w->tail,.primary=primary};}
static inline int legal(Path p,const Word *w){unsigned v=(unsigned)(p.tail+w->lead-2);return v<=8;}
static inline void add(Path *p,const Word *w,int first){assert(legal(*p,w));if(!first){int gap=p->tail+w->lead+1;p->count++;p->n11+=gap==11;p->len+=gap;}p->count+=w->nrun;p->n11+=w->n11;p->len+=w->len;p->d+=p->l*w->ds;p->l*=w->flip;p->st=w->st;p->tail=w->tail;}
static inline int branch(Path p,int i){return (p.st==1||p.st==4)&&legal(p,&mainw[i])&&legal(p,&mainw[i+3]);}
static inline Path choose(Path a,Path b){return abs(a.d)<=abs(b.d)?a:b;}
static Path frame(const unsigned q[4],Path in,int cat,int off){int g=in.st<=2?0:1;const Word *s=syncw[g][0]+cat,*t=syncw[g][1]+cat;Path a=start(in,s,1),b=start(in,t,0);for(int j=0;j<91;j++){int x=q[(j+off)&3],i=x*4;if(x<=87){Path w=choose(a,b);int k=i+w.st-1;a=b=w;add(&a,&mainw[k],j==0);add(&b,&subw[k],j==0);continue;}int f=branch(a,i),h=branch(b,i);if(f&&h){a=b=choose(a,b);add(&a,&mainw[i],j==0);add(&b,&mainw[i+3],j==0);}else if(f||h){Path e=f?a:b,o=f?b:a;if(abs(e.d)<abs(o.d)||(abs(e.d)==abs(o.d)&&f)){a=b=e;add(&a,&mainw[i],j==0);add(&b,&mainw[i+3],j==0);}else{add(&a,&mainw[i+a.st-1],j==0);add(&b,&mainw[i+b.st-1],j==0);}}else{add(&a,&mainw[i+a.st-1],j==0);add(&b,&mainw[i+b.st-1],j==0);}}
Path w=choose(a,b);if(w.d>63||w.d< -64){const Word *first=w.primary?s:t,*alt=w.primary?t:s;int oldstart=in.d+in.l*first->ds,oldlevel=in.l*first->flip,newlevel=in.l*alt->flip;int d=in.d+in.l*alt->ds+(w.d-oldstart)*oldlevel*newlevel;if(abs(d)<abs(w.d)){w.d=d;w.l*=oldlevel*newlevel;}}return w;}
static Score measure(uint32_t v,int n,int d,int l){unsigned q[4]={v>>24,(v>>16)&255,(v>>8)&255,v&255};Path p={.st=1,.d=d,.l=l};Score s={0};for(int j=0;j<n;j++){p=frame(q,p,j%8,(j*91)&3);s.count+=p.count;s.n11+=p.n11;s.len+=p.len;}return s;}
static Score validate(uint32_t v){Score a={0};int ds[]={0,63,-64};for(int l=1;l>=-1;l-=2)for(int i=0;i<3;i++){Score b=measure(v,16,ds[i],l);a.count+=b.count;a.n11+=b.n11;a.len+=b.len;}return a;}
typedef struct {uint32_t q;Score s;} Candidate;
static int better(Candidate a,Candidate b){if(!b.s.count)return 1;int64_t x=(int64_t)a.s.n11*b.s.count,y=(int64_t)b.s.n11*a.s.count;return x>y||(x==y&&a.q<b.q);}
static void insert(Candidate *a,Candidate v){if(!better(v,a[TOP-1]))return;int j=TOP-1;while(j&&better(v,a[j-1])){a[j]=a[j-1];j--;}a[j]=v;}
static uint32_t permute(uint32_t x){x^=0x5a837211u;x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
typedef struct {uint64_t from,to;int sequential;Candidate top[TOP],verified;} Job;
static void *worker(void *arg){Job *j=arg;for(uint64_t i=j->from;i<j->to;i++){uint32_t q=j->sequential?(uint32_t)i:permute((uint32_t)i);Candidate a={q,measure(q,2,0,1)};insert(j->top,a);
 // Independently validate every candidate whose two-frame score meets the known 96-frame record.
 if((int64_t)a.s.n11*20180 >= (int64_t)5850*a.s.count){Candidate b={q,validate(q)};if(better(b,j->verified))j->verified=b;}
 }return NULL;}
static double now(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec*1e-9;}
static uint64_t number(const char *s){char *end;errno=0;uint64_t n=strtoull(s,&end,0);if(errno||!*s||*end||*s=='-'){fprintf(stderr,"Invalid number: %s\n",s);exit(2);}return n;}
static void report(uint32_t q,Score s){printf("%08" PRIX32 "  11T=%9.5f%% length=%9.5f%% count=%d n11=%d\n",q,100.0*s.n11/s.count,1100.0*s.n11/s.len,s.count,s.n11);}
int main(int argc,char **argv){uint64_t nt=1,count=100000,starti=0;int sequential=0;const char *table="tables.txt";for(int i=1;i<argc;i++){if(!strcmp(argv[i],"--sequential")){sequential=1;continue;}if(!strcmp(argv[i],"--help")){puts("search --threads N --count N --start N [--sequential] [--table tables.txt]");return 0;}if(i+1>=argc)return 2;const char *a=argv[i],*b=argv[++i];if(!strcmp(a,"--threads"))nt=number(b);else if(!strcmp(a,"--count"))count=number(b);else if(!strcmp(a,"--start"))starti=number(b);else if(!strcmp(a,"--table"))table=b;else return 2;}if(!nt||nt>1024||!count||starti>=SPACE||count>SPACE-starti)return 2;load(table);Score base=validate(0x838d838d),check=validate(0xd5291f59),record=validate(0x03079a90);if(base.n11!=4320||base.count!=17376||check.n11!=3960||check.count!=22220||check.len!=139074||record.n11!=5850||record.count!=20180){fprintf(stderr,"Baseline mismatch\n");report(0x838d838d,base);report(0xd5291f59,check);report(0x03079a90,record);return 1;}printf("baseline: ");report(0x03079a90,record);Job *jobs=calloc(nt,sizeof *jobs);pthread_t *th=calloc(nt,sizeof *th);if(!jobs||!th)return 1;double t=now();for(uint64_t i=0;i<nt;i++){jobs[i].from=starti+count*i/nt;jobs[i].to=starti+count*(i+1)/nt;jobs[i].sequential=sequential;if(pthread_create(&th[i],NULL,worker,&jobs[i]))return 1;}for(uint64_t i=0;i<nt;i++)if(pthread_join(th[i],NULL))return 1;double sec=now()-t;Candidate top[TOP]={0},verified[TOP]={0};for(uint64_t i=0;i<nt;i++)for(int j=0;j<TOP;j++)if(jobs[i].top[j].s.count)insert(top,jobs[i].top[j]);printf("threads=%" PRIu64 " count=%" PRIu64 " start=%" PRIu64 " seconds=%.6f rate=%.1f full_hours=%.4f\n",nt,count,starti,sec,count/sec,SPACE*sec/count/3600);t=now();for(int i=0;i<TOP;i++)if(top[i].s.count)insert(verified,(Candidate){top[i].q,validate(top[i].q)});printf("validation_seconds=%.6f\n",now()-t);for(uint64_t i=0;i<nt;i++)if(jobs[i].verified.s.count){printf("threshold: ");report(jobs[i].verified.q,jobs[i].verified.s);}for(int i=0;i<TOP&&verified[i].s.count;i++)report(verified[i].q,verified[i].s);free(jobs);free(th);return 0;}
